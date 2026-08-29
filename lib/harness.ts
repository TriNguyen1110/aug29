// The real harness run: three scoped subagent calls (logs, diff, external) against
// TrueForge, an approval gate that genuinely blocks on a human decision, and a
// post-approval executor that runs only the approved ActionSpec. Event shapes are
// CONTRACT.md's IncidentEvent exactly.
//
// No hardcoded/canned findings, hypothesis text, or Evidence.excerpt anywhere on this
// path — every finding/claim comes from a real TrueForge model call reasoning over real
// tool output (lib/simTools.ts for logs/diff, a real Bright Data scrape for external).
// Every Evidence.excerpt is asserted (in code) to be a literal substring of the tool
// output it claims to come from; if the model can't produce a grounded excerpt, that
// claim's evidence is dropped to [] rather than trusting the model's paraphrase.

import { randomUUID } from "node:crypto";
import { appendEvent, addApproval, addIncident, getApproval, updateApproval, updateIncidentStatus } from "./store";
import { publish } from "./bus";
import { runTfTurn, parseTfJson, startRemediationTurn, resumeRemediationTurn, type PausedRemediationTurn } from "./trueforge";
import { logQuery, gitLog, gitShow } from "./simTools";
import { getCachedFallback, getTargets, scrapeTarget } from "./brightdata";
import type { ActionSpec, Alternative, Claim, Evidence, Incident, IncidentEvent } from "./types";

const MODEL_SUB = "openai/gpt-5-4-mini";
const MODEL_MAIN = "openai/gpt-5-5";

function emit(incidentId: string, type: IncidentEvent["type"], payload: Record<string, unknown>): IncidentEvent {
  const event: IncidentEvent = {
    id: `evt_${randomUUID()}`,
    incidentId,
    ts: new Date().toISOString(),
    type,
    payload,
  };
  appendEvent(event);
  publish(incidentId, event);
  return event;
}

// Keyed by Evidence.source, not a flat list — provenance matters, not just "the excerpt
// exists somewhere." (Qodo PR #1 finding, BOARD.tsv H+2.2b: checking against ANY source
// text let a claim mislabel which source an excerpt actually came from and still pass.)
type SourceTextMap = Partial<Record<Evidence["source"], string>>;

// Every claim's evidence must be a literal substring of the SPECIFIC source it claims to
// come from (evidence.source), never any source text that happens to contain it. Never
// trust the model's own excerpt verbatim without checking — drop to [] instead of
// fabricating/paraphrasing/mislabeling (CONTRACT.md's core grounding rule).
function groundEvidence(evidence: Evidence[] | undefined, sourceTexts: SourceTextMap): Evidence[] {
  if (!evidence) return [];
  return evidence.filter((e) => {
    if (!e?.excerpt) return false;
    const text = sourceTexts[e.source];
    return typeof text === "string" && text.includes(e.excerpt);
  });
}

function groundClaims(claims: Claim[] | undefined, sourceTexts: SourceTextMap): Claim[] {
  if (!claims) return [];
  return claims.map((c) => ({ text: c.text, evidence: groundEvidence(c.evidence, sourceTexts) }));
}

type SubagentFindingResult = { finding: string; evidence: Evidence[] };

const findingSchema = {
  type: "object",
  properties: {
    finding: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string", enum: ["log", "diff", "commit", "external"] },
          ref: { type: "string" },
          excerpt: { type: "string" },
        },
        required: ["source", "ref", "excerpt"],
        additionalProperties: false,
      },
    },
  },
  required: ["finding", "evidence"],
  additionalProperties: false,
};

// --- logs subagent -----------------------------------------------------------------
// Scoped tool access: this call site only ever reaches logQuery(). It has no reference
// to gitLog/gitShow/scrapeTarget at all (rule 1, CONTRACT.md).
async function runLogsSubagent(incidentId: string): Promise<{ result: SubagentFindingResult; sourceText: string }> {
  emit(incidentId, "subagent_start", {
    agent: "logs",
    task: "Pull error-rate samples for checkout-service around the reported spike",
    allowedTools: ["log_query"],
  });

  const input = "service=checkout-service window=14:55-15:10";
  const output = logQuery(input);
  emit(incidentId, "tool_call", { agent: "logs", tool: "log_query", input, output });

  const raw = await runTfTurn({
    model: MODEL_SUB,
    instructions:
      "You are the LOGS investigation subagent for an incident-response system. You are given the exact " +
      "output of one log_query tool call. Identify the single most important finding from it. Return JSON " +
      "matching the schema: { finding: string, evidence: Evidence[] }. Every evidence.excerpt MUST be a " +
      "literal, verbatim substring copied character-for-character from the tool output you were given — " +
      "never paraphrase or invent a line. evidence.source must be \"log\". evidence.ref should identify the " +
      "line, e.g. \"checkout-service.log:15:04:12\". If nothing conclusive, return evidence: [].",
    userMessage: `log_query tool output:\n${output}`,
    jsonSchema: findingSchema,
    jsonSchemaName: "logs_finding",
  });
  const parsed = parseTfJson<SubagentFindingResult>(raw);
  const grounded: SubagentFindingResult = { finding: parsed.finding, evidence: groundEvidence(parsed.evidence, { log: output }) };

  emit(incidentId, "subagent_result", { agent: "logs", finding: grounded.finding, evidence: grounded.evidence });
  return { result: grounded, sourceText: output };
}

// --- diff subagent ------------------------------------------------------------------
// Scoped tool access: this call site only ever reaches gitLog()/gitShow(). No log-query
// tool reference exists here at all (rule 1, CONTRACT.md).
async function runDiffSubagent(incidentId: string): Promise<{ result: SubagentFindingResult; sourceText: string }> {
  emit(incidentId, "subagent_start", {
    agent: "diff",
    task: "Check recent deploys/commits to checkout-service around the spike window",
    allowedTools: ["git_log", "git_show"],
  });

  const logInput = "repo=checkout-service since=2026-08-29T14:30:00Z";
  const logOutput = gitLog(logInput);
  emit(incidentId, "tool_call", { agent: "diff", tool: "git_log", input: logInput, output: logOutput });

  const showInput = "commit=d4e5f6a path=src/payments/payment_intent_client.ts";
  const showOutput = gitShow(showInput);
  emit(incidentId, "tool_call", { agent: "diff", tool: "git_show", input: showInput, output: showOutput });

  const combined = `${logOutput}\n${showOutput}`;
  const raw = await runTfTurn({
    model: MODEL_SUB,
    instructions:
      "You are the DIFF investigation subagent for an incident-response system. You are given the exact " +
      "output of a git_log call and a git_show call, concatenated. Identify the single most important " +
      "finding. Return JSON matching the schema: { finding: string, evidence: Evidence[] }. Every " +
      "evidence.excerpt MUST be a literal, verbatim substring copied character-for-character from the text " +
      "you were given — never paraphrase or invent a line. evidence.source must be \"commit\" or \"diff\". " +
      "If nothing conclusive, return evidence: [].",
    userMessage: `git_log output:\n${logOutput}\n\ngit_show output:\n${showOutput}`,
    jsonSchema: findingSchema,
    jsonSchemaName: "diff_finding",
  });
  const parsed = parseTfJson<SubagentFindingResult>(raw);
  // The diff subagent's instructions allow evidence.source to be either "commit" or
  // "diff" — both legitimately refer to this same git_log+git_show text, so both keys map
  // to it (unlike logs/external, which each only ever have one valid source).
  const grounded: SubagentFindingResult = {
    finding: parsed.finding,
    evidence: groundEvidence(parsed.evidence, { commit: combined, diff: combined }),
  };

  emit(incidentId, "subagent_result", { agent: "diff", finding: grounded.finding, evidence: grounded.evidence });
  return { result: grounded, sourceText: combined };
}

// --- external subagent (real Bright Data) -------------------------------------------
// Scoped tool access: this call site only ever reaches scrapeTarget(). No log/diff tool
// reference exists here at all (rule 1, CONTRACT.md).
async function runExternalSubagent(incidentId: string): Promise<{ result: SubagentFindingResult; sourceText: string }> {
  emit(incidentId, "subagent_start", {
    agent: "external",
    task: "Check the real stripe-node GitHub releases page (latest ~10 releases, first page only, full changelog body text) for any recent behavior change that could explain a checkout-service error spike, and GitHub's status page for a broader vendor outage",
    allowedTools: ["bdata_scrape"],
  });

  const targets = getTargets();
  const scraped: { name: string; url: string; text: string }[] = [];

  for (const target of targets) {
    const result = await scrapeTarget(target);
    if (result.ok) {
      emit(incidentId, "tool_call", {
        agent: "external",
        tool: "bdata_scrape",
        input: `collector=${target.collectorId} url=${target.url}`,
        // Persist the FULL raw scrape text, not a truncated slice — synthesis reads up to
        // 12000 chars and groundEvidence checks the full untruncated text, so truncating
        // the persisted audit-log event here would let a claim cite content invisible in
        // the event log (Qodo PR #1 finding, BOARD.tsv H+2.2c). Keeping the audit log
        // complete is worth the size; these pages are tens of KB, not unbounded.
        output: result.raw,
      });
      scraped.push({ name: target.name, url: target.url, text: result.raw });
    } else {
      emit(incidentId, "tool_call", {
        agent: "external",
        tool: "bdata_scrape",
        input: `collector=${target.collectorId} url=${target.url}`,
        output: `(scrape issue: ${result.cause}) ${result.note}`,
      });
      emit(incidentId, "scrape_issue", {
        targetUrl: target.url,
        collectorId: target.collectorId,
        cause: result.cause,
        note: result.note,
      });

      // Demo-safety net (BOARD.tsv item 09): the live scrape for this target failed or was too
      // slow (a real timeout, network, or bot-wall cause -- never used to paper over a genuine
      // clean/empty page result, since scrapeTarget only returns !ok on an actual problem). If a
      // pre-downloaded real dataset exists for this target's cached fallback, replay it -- but
      // honestly labeled as replayed, never presented as a fresh live scrape (CONTRACT.md
      // fallback table).
      const fallback = getCachedFallback(target.name);
      if (fallback) {
        const label = `[REPLAYED FROM CACHED SCRAPE, NOT LIVE -- ${fallback.cachePath}]`;
        emit(incidentId, "tool_call", {
          agent: "external",
          tool: "bdata_scrape",
          input: `collector=${target.collectorId} url=${target.url} (cached fallback replay, live scrape failed: ${result.cause})`,
          // Full text, same reasoning as the live-scrape tool_call above.
          output: `${label}\n${fallback.raw}`,
        });
        scraped.push({ name: target.name, url: target.url, text: `${label}\n${fallback.raw}` });
      }
    }
  }

  if (scraped.length === 0) {
    const grounded: SubagentFindingResult = {
      finding: "No usable external evidence — every Bright Data scrape for this run failed or came back short (see scrape_issue events).",
      evidence: [],
    };
    emit(incidentId, "subagent_result", { agent: "external", finding: grounded.finding, evidence: grounded.evidence });
    return { result: grounded, sourceText: "" };
  }

  const combined = scraped.map((s) => `--- ${s.name} (${s.url}) ---\n${s.text}`).join("\n\n");
  const raw = await runTfTurn({
    model: MODEL_SUB,
    instructions:
      "You are the EXTERNAL investigation subagent for an incident-response system, investigating a " +
      "checkout-service error spike that the diff subagent already tied to a deploy bumping the stripe-node " +
      "dependency from 14.8.0 to 17.0.0. You are given the exact text scraped live from (1) the real " +
      "stripe-node GitHub releases page — this extraction covers the version, title, and full changelog body " +
      "text of only the latest ~10 releases on the first page (no pagination), so it may or may not still " +
      "include the exact 14.8.0->17.0.0 range depending on how many releases have shipped since; check " +
      "whatever release notes you do have for any behavior change (e.g. a default timeout/retry change) that " +
      "would explain connection/timeout failures after a stripe-node bump, and (2) GitHub's own status page — " +
      "check for a broader GitHub-wide outage that could independently explain the spike. State plainly what " +
      "each page actually shows. Return JSON: { finding: string, evidence: Evidence[] }. Every " +
      "evidence.excerpt MUST be a literal, verbatim substring copied character-for-character from the scraped " +
      "text — never paraphrase or invent a line. evidence.source must be \"external\". If a page is " +
      "clean/irrelevant, or the exact version range isn't covered by these latest releases, return " +
      "evidence: [] for that part and say so explicitly in finding rather than asserting a cause. If a " +
      "source's text block starts with \"[REPLAYED FROM CACHED SCRAPE, NOT LIVE ...]\", that source is real " +
      "historical data but was not fetched live for this run -- you must say so explicitly in finding " +
      "(e.g. \"from a cached scrape, not live\") rather than presenting it as freshly scraped.",
    userMessage: combined.slice(0, 12000),
    jsonSchema: findingSchema,
    jsonSchemaName: "external_finding",
  });
  const parsed = parseTfJson<SubagentFindingResult>(raw);
  const grounded: SubagentFindingResult = { finding: parsed.finding, evidence: groundEvidence(parsed.evidence, { external: combined }) };

  emit(incidentId, "subagent_result", { agent: "external", finding: grounded.finding, evidence: grounded.evidence });
  return { result: grounded, sourceText: combined };
}

// --- synthesis: hypothesis or clarification -----------------------------------------

type SynthesisResult =
  | {
      canHypothesize: true;
      rootCause: string;
      proposedFix: string;
      claims: Claim[];
      action: string;
      actionSpec: ActionSpec;
      alternatives: Alternative[];
    }
  | { canHypothesize: false; question: string; gap: string };

const synthesisSchema = {
  type: "object",
  properties: {
    canHypothesize: { type: "boolean" },
    rootCause: { type: "string" },
    proposedFix: { type: "string" },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: { type: "string", enum: ["log", "diff", "commit", "external"] },
                ref: { type: "string" },
                excerpt: { type: "string" },
              },
              required: ["source", "ref", "excerpt"],
              additionalProperties: false,
            },
          },
        },
        required: ["text", "evidence"],
        additionalProperties: false,
      },
    },
    action: { type: "string" },
    actionSpec: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["rollback", "restart", "toggle_flag"] },
        target: { type: "string" },
        params: { type: "object", additionalProperties: { type: "string" } },
      },
      required: ["type", "target", "params"],
      additionalProperties: false,
    },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: { description: { type: "string" }, tradeoff: { type: "string" } },
        required: ["description", "tradeoff"],
        additionalProperties: false,
      },
    },
    question: { type: "string" },
    gap: { type: "string" },
  },
  required: ["canHypothesize", "rootCause", "proposedFix", "claims", "action", "actionSpec", "alternatives", "question", "gap"],
  additionalProperties: false,
};

async function runSynthesis(
  incidentId: string,
  findings: { agent: string; result: SubagentFindingResult }[],
  sourceTextMap: SourceTextMap
): Promise<SynthesisResult> {
  const findingsText = findings
    .map((f) => `${f.agent} subagent finding: ${f.result.finding}\nevidence: ${JSON.stringify(f.result.evidence)}`)
    .join("\n\n");

  const hasAnyEvidence = findings.some((f) => f.result.evidence.length > 0);

  const raw = await runTfTurn({
    model: MODEL_MAIN,
    instructions:
      "You are the incident-response synthesis agent. You are given the findings and evidence produced by " +
      "three investigation subagents (logs, diff, external) for a checkout-service error spike. Decide: can " +
      "you name a root cause backed by at least one Claim that has non-empty evidence? Only use evidence " +
      "objects that were already provided to you by the subagents — copy them verbatim, never invent a new " +
      "excerpt. If you cannot back at least one claim with real evidence, set canHypothesize=false and fill " +
      "in question/gap instead of forcing a low-confidence guess (leave the hypothesis fields as empty " +
      "strings/arrays in that case). If you can, set canHypothesize=true, name rootCause and proposedFix, " +
      "give 2+ claims (some may honestly have evidence: [] if inferred rather than directly observed — say " +
      "so in the claim text), a structured actionSpec for the one fix you recommend (type is rollback, " +
      "restart, or toggle_flag; target is the service name; params are the specific values), and at least " +
      "one real alternative you considered with its tradeoff (leave question/gap as empty strings in that " +
      "case). Return JSON matching the schema exactly, filling unused branch fields with empty string/array.",
    userMessage: findingsText,
    jsonSchema: synthesisSchema,
    jsonSchemaName: "synthesis",
    strict: false, // actionSpec.params is an open string dictionary — incompatible with strict mode
  });
  const parsed = parseTfJson<{
    canHypothesize: boolean;
    rootCause: string;
    proposedFix: string;
    claims: Claim[];
    action: string;
    actionSpec: ActionSpec;
    alternatives: Alternative[];
    question: string;
    gap: string;
  }>(raw);

  if (!parsed.canHypothesize || !hasAnyEvidence) {
    return {
      canHypothesize: false,
      question: parsed.question || "Investigation didn't surface a backed root cause — what additional context is available?",
      gap: parsed.gap || "None of the three subagents returned grounded evidence for a specific cause.",
    };
  }

  const grounded = groundClaims(parsed.claims, sourceTextMap);
  // Require at least one claim to retain real (non-empty) evidence after grounding —
  // otherwise the model's excerpts didn't actually match tool output and we must not
  // present this as evidence-backed (CONTRACT.md's core rule).
  if (!grounded.some((c) => c.evidence.length > 0)) {
    return {
      canHypothesize: false,
      question: "Investigation surfaced findings but no claim's evidence could be verified as a literal quote from tool output — what additional context is available?",
      gap: "Model-proposed evidence excerpts did not match any real tool output verbatim after grounding check.",
    };
  }

  // ActionSpec.params must be Record<string,string> per CONTRACT.md; coerce defensively
  // since the model call used a relaxed (non-strict) schema to allow the open dictionary
  // shape, and may return non-string values.
  const coercedParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.actionSpec?.params ?? {})) {
    coercedParams[k] = typeof v === "string" ? v : JSON.stringify(v);
  }

  return {
    canHypothesize: true,
    rootCause: parsed.rootCause,
    proposedFix: parsed.proposedFix,
    claims: grounded,
    action: parsed.action,
    actionSpec: { ...parsed.actionSpec, params: coercedParams },
    alternatives: parsed.alternatives?.length ? parsed.alternatives : [
      { description: "Take no action and continue monitoring", tradeoff: "Zero risk of a bad remediation, but the error rate stays elevated for customers in the meantime." },
    ],
  };
}

// --- approval gate + clarification gate: real blocking ------------------------------

type PendingApproval = { resolve: (decision: "approve" | "deny") => void };
type PendingClarification = { resolve: (answer: string) => void };

const globalKey = "__incidentAgentHarnessPending__" as const;
function getPending(): { approvals: Map<string, PendingApproval>; clarifications: Map<string, PendingClarification> } {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: { approvals: Map<string, PendingApproval>; clarifications: Map<string, PendingClarification> };
  };
  if (!g[globalKey]) g[globalKey] = { approvals: new Map(), clarifications: new Map() };
  return g[globalKey];
}

export function resolveApproval(approvalId: string, decision: "approve" | "deny"): boolean {
  const pending = getPending().approvals.get(approvalId);
  if (!pending) return false;
  getPending().approvals.delete(approvalId);
  pending.resolve(decision);
  return true;
}

export function resolveClarification(incidentId: string, answer: string): boolean {
  const pending = getPending().clarifications.get(incidentId);
  if (!pending) return false;
  getPending().clarifications.delete(incidentId);
  pending.resolve(answer);
  return true;
}

function waitForApproval(approvalId: string): Promise<"approve" | "deny"> {
  return new Promise((resolve) => {
    getPending().approvals.set(approvalId, { resolve });
  });
}

function waitForClarification(incidentId: string): Promise<string> {
  return new Promise((resolve) => {
    getPending().clarifications.set(incidentId, { resolve });
  });
}

// --- main run -------------------------------------------------------------------------

// Item 18 (BOARD.tsv): the trigger's `scenario` text was previously display-only — every
// live run silently investigated the same fixed checkout/Stripe fixture (lib/simTools.ts)
// no matter what was typed, which is worse than being honest about the limitation. Given
// remaining build time, the fix taken is option (b) from item 18's note: keep the single
// real fixture (building out several distinct, fully-wired named scenarios was too large
// for the time left), but make the mismatch honest and visible on the timeline instead of
// silent. CONTRACT.md's event shapes are frozen, so this reuses the existing
// "summary_posted" type rather than inventing a new one.
const CHECKOUT_SCENARIO_KEYWORDS = ["checkout", "stripe", "payment"];

function scenarioMatchesWiredFixture(scenario: string): boolean {
  const lower = scenario.toLowerCase();
  return CHECKOUT_SCENARIO_KEYWORDS.some((k) => lower.includes(k));
}

export async function runIncident(incidentId: string, scenario: string): Promise<void> {
  const incident: Incident = {
    id: incidentId,
    title: scenario,
    status: "investigating",
    createdAt: new Date().toISOString(),
  };
  addIncident(incident);

  if (!scenarioMatchesWiredFixture(scenario)) {
    emit(incidentId, "summary_posted", {
      channel: "#incidents",
      text: `Note: this build has exactly one real investigation fixture wired up — a checkout-service/Stripe error-rate spike (keywords: ${CHECKOUT_SCENARIO_KEYWORDS.join(", ")}). The trigger text "${scenario}" didn't match any of those keywords, so this run is investigating that fixed fixture anyway rather than a scenario built for what you typed — the scenario text does not yet select different real data (see BOARD.tsv item 18).`,
    });
  }

  try {
    const logs = await runLogsSubagent(incidentId);
    const diff = await runDiffSubagent(incidentId);
    const external = await runExternalSubagent(incidentId);

    let findings = [
      { agent: "logs", result: logs.result },
      { agent: "diff", result: diff.result },
      { agent: "external", result: external.result },
    ];
    // Keyed by Evidence.source so grounding checks an excerpt against the SPECIFIC source
    // it claims, not any of the three subagents' text (Qodo PR #1 finding, H+2.2b). "commit"
    // and "diff" both legitimately point at the diff subagent's combined git_log+git_show
    // text; there is no valid Evidence.source for the on-call clarification answer below
    // (it's free-text context, never asserted as tool evidence), so the map doesn't need an
    // entry for it.
    const sourceTextMap: SourceTextMap = {
      log: logs.sourceText,
      diff: diff.sourceText,
      commit: diff.sourceText,
      external: external.sourceText,
    };

    let synthesis = await runSynthesis(incidentId, findings, sourceTextMap);

    if (!synthesis.canHypothesize) {
      emit(incidentId, "clarification_requested", { question: synthesis.question, gap: synthesis.gap });
      const answer = await waitForClarification(incidentId);
      emit(incidentId, "clarification_provided", { question: synthesis.question, answer });

      // Resume with the added context folded into the findings pool as free-text context
      // (not asserted as tool evidence, so sourceTextMap is unchanged) and re-run synthesis
      // once.
      findings = [...findings, { agent: "on-call", result: { finding: answer, evidence: [] } }];
      synthesis = await runSynthesis(incidentId, findings, sourceTextMap);

      if (!synthesis.canHypothesize) {
        // Still can't back a claim even with clarification — stop honestly rather than
        // forcing a hypothesis. Leave the incident investigating; a human can re-trigger.
        return;
      }
    }

    emit(incidentId, "hypothesis", {
      rootCause: synthesis.rootCause,
      proposedFix: synthesis.proposedFix,
      claims: synthesis.claims,
    });

    const approvalId = `appr_${randomUUID()}`;
    addApproval({
      id: approvalId,
      incidentId,
      action: synthesis.action,
      actionSpec: synthesis.actionSpec,
      claims: synthesis.claims,
      alternatives: synthesis.alternatives,
      status: "pending",
      requestedAt: new Date().toISOString(),
      resolvedAt: null,
    });

    // Item 11: the ActionSpec is a real, gated MCP tool (execute_remediation, hosted at
    // app/api/mcp/remediation) that TrueForge itself pauses on — this is the harness's
    // NATIVE tool.approval_required primitive, not our own hand-rolled block. Drive the
    // remediation agent to call it with the literal approved values before we ever tell
    // anyone an approval is pending, so `approval_requested` below reflects a pause that
    // genuinely already exists inside TrueForge.
    const paused: PausedRemediationTurn = await startRemediationTurn({
      model: MODEL_SUB,
      incidentId,
      approvalId,
      actionSpec: synthesis.actionSpec,
    });

    // Never trust the model's tool call blindly: diff-check what it actually passed
    // against the exact approved ActionSpec (CONTRACT.md rule 2) before treating the pause
    // as legitimate. A mismatch here means the model altered the values we gave it
    // verbatim — refuse rather than proceed on drifted parameters.
    const paramsMatch = (a: Record<string, string> | undefined, b: Record<string, string>) => {
      const ak = Object.keys(a ?? {}).sort();
      const bk = Object.keys(b).sort();
      return ak.length === bk.length && ak.every((k, i) => k === bk[i] && a?.[k] === b[k]);
    };
    const argsMatchApproved =
      paused.calledInput?.incidentId === incidentId &&
      paused.calledInput?.approvalId === approvalId &&
      paused.calledInput?.type === synthesis.actionSpec.type &&
      paused.calledInput?.target === synthesis.actionSpec.target &&
      paramsMatch(paused.calledInput?.params, synthesis.actionSpec.params);

    if (!argsMatchApproved) {
      await resumeRemediationTurn({
        sessionId: paused.sessionId,
        turnId: paused.turnId,
        threadId: paused.threadId,
        toolCallId: paused.toolCallId,
        decision: "deny",
        denyReason: "Tool call arguments did not match the approved ActionSpec verbatim — refused before any human approval was even requested.",
      });
      throw new Error(
        `remediation tool call arguments diverged from the approved ActionSpec (called: ${JSON.stringify(paused.calledInput)}, approved: ${JSON.stringify(synthesis.actionSpec)}) — refused execution`
      );
    }

    emit(incidentId, "approval_requested", {
      approvalId,
      action: synthesis.action,
      claims: synthesis.claims,
      actionSpec: synthesis.actionSpec,
      alternatives: synthesis.alternatives,
    });

    // Flip status only once approval_requested is actually in the log — otherwise a
    // GET landing in the gap between the status flip and the event append would see
    // status "awaiting_approval" with no approval_requested event yet, which is exactly
    // the kind of frontend-visible inconsistency the grounding rules forbid.
    updateIncidentStatus(incidentId, "awaiting_approval");

    // Genuinely blocks here — resolves only when POST /api/incidents/:id/approvals/:id
    // calls resolveApproval(). No timeout, no auto-approve. The real enforcement is
    // TrueForge's own paused turn above; this Promise just lets our API route wake this
    // coroutine back up with the human's decision so we know which way to resume it.
    const decision = await waitForApproval(approvalId);

    const approvalRecord = getApproval(approvalId);
    if (!approvalRecord) throw new Error(`approval ${approvalId} vanished from store`);
    updateApproval({ ...approvalRecord, status: decision === "approve" ? "approved" : "denied", resolvedAt: new Date().toISOString() });

    if (decision === "deny") {
      try {
        await resumeRemediationTurn({
          sessionId: paused.sessionId,
          turnId: paused.turnId,
          threadId: paused.threadId,
          toolCallId: paused.toolCallId,
          decision: "deny",
        });
      } catch (err) {
        // Item 19 (New finding #4): the resume call throwing here left the incident
        // stuck at "awaiting_approval" forever — revert to a truthful, non-stuck status
        // and emit a signal distinct from a failed investigation so this doesn't read as
        // "the run never got this far."
        updateIncidentStatus(incidentId, "investigating");
        emit(incidentId, "summary_posted", {
          channel: "#incidents",
          text: `Remediation failed: resuming the denied approval ${approvalId} threw (${(err as Error).message}). Reverted to investigating for manual follow-up — the denial itself was never confirmed to TrueForge.`,
        });
        return;
      }
      emit(incidentId, "approval_denied", { approvalId });
      updateIncidentStatus(incidentId, "investigating");
      return;
    }

    emit(incidentId, "approval_granted", { approvalId });
    updateIncidentStatus(incidentId, "remediating");

    // Execute only what was approved: resume the SAME paused TrueForge turn with "allow" —
    // the harness itself calls the gated execute_remediation tool for real at this point,
    // never let the model re-derive "what the fix should be" here (CONTRACT.md rule 2).
    try {
      const approved = getApproval(approvalId);
      if (!approved || approved.status !== "approved") {
        throw new Error(`refusing to execute: approval ${approvalId} is not in approved state`);
      }
      const spec = approved.actionSpec;
      const { resultText: result } = await resumeRemediationTurn({
        sessionId: paused.sessionId,
        turnId: paused.turnId,
        threadId: paused.threadId,
        toolCallId: paused.toolCallId,
        decision: "approve",
      });

      emit(incidentId, "action_executed", { action: approved.action, actionSpec: spec, result });

      const summaryText = `${scenario}: ${synthesis.rootCause} Fix applied: ${approved.action}. ${result}`;
      emit(incidentId, "summary_posted", { channel: "#incidents", text: summaryText });

      updateIncidentStatus(incidentId, "resolved");
    } catch (err) {
      // Item 19 (New finding #4): a throw anywhere between "remediating" and "resolved"
      // previously left the incident stuck in the active-sounding "remediating" status
      // forever with no distinct failure signal — indistinguishable from a still-running
      // remediation. Revert to "investigating" (truthful: the fix was NOT confirmed
      // applied, needs a human to look again) and say so explicitly, separately from a
      // failed-investigation summary.
      updateIncidentStatus(incidentId, "investigating");
      emit(incidentId, "summary_posted", {
        channel: "#incidents",
        text: `Remediation failed: executing the approved action for "${scenario}" threw (${(err as Error).message}). Reverted to investigating — the approved fix was NOT confirmed applied and needs manual follow-up.`,
      });
      return;
    }
  } catch (err) {
    // Fail loudly into the event log rather than leaving the run silently stuck.
    emit(incidentId, "summary_posted", {
      channel: "#incidents",
      text: `Run for "${scenario}" failed: ${(err as Error).message}`,
    });
    throw err;
  }
}
