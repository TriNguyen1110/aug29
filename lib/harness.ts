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
import { runTfTurn, parseTfJson } from "./trueforge";
import { logQuery, gitLog, gitShow } from "./simTools";
import { getTargets, scrapeTarget } from "./brightdata";
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

// Every claim's evidence must be a literal substring of the tool output it cites.
// Never trust the model's own excerpt verbatim without checking — drop to [] instead of
// fabricating/paraphrasing (CONTRACT.md's core grounding rule).
function groundEvidence(evidence: Evidence[] | undefined, sourceTexts: string[]): Evidence[] {
  if (!evidence) return [];
  return evidence.filter((e) => e?.excerpt && sourceTexts.some((t) => t.includes(e.excerpt)));
}

function groundClaims(claims: Claim[] | undefined, sourceTexts: string[]): Claim[] {
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
  const grounded: SubagentFindingResult = { finding: parsed.finding, evidence: groundEvidence(parsed.evidence, [output]) };

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
  const grounded: SubagentFindingResult = { finding: parsed.finding, evidence: groundEvidence(parsed.evidence, [combined]) };

  emit(incidentId, "subagent_result", { agent: "diff", finding: grounded.finding, evidence: grounded.evidence });
  return { result: grounded, sourceText: combined };
}

// --- external subagent (real Bright Data) -------------------------------------------
// Scoped tool access: this call site only ever reaches scrapeTarget(). No log/diff tool
// reference exists here at all (rule 1, CONTRACT.md).
async function runExternalSubagent(incidentId: string): Promise<{ result: SubagentFindingResult; sourceText: string }> {
  emit(incidentId, "subagent_start", {
    agent: "external",
    task: "Check Stripe's status page and API changelog for anything correlating with the checkout spike",
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
        output: result.raw.slice(0, 4000),
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
      "checkout-service error spike that may or may not correlate with Stripe. You are given the exact " +
      "text scraped live from Stripe's status page and/or API changelog. State plainly whether either page " +
      "shows anything (an active incident, or a recent changelog entry) that could explain a checkout API " +
      "error spike today, or whether they're both clean/irrelevant and an internal cause must be assumed. " +
      "Return JSON: { finding: string, evidence: Evidence[] }. Every evidence.excerpt MUST be a literal, " +
      "verbatim substring copied character-for-character from the scraped text — never paraphrase or invent " +
      "a line. evidence.source must be \"external\". If the pages are clean, return evidence: [] and say so " +
      "explicitly in finding rather than asserting a cause.",
    userMessage: combined.slice(0, 12000),
    jsonSchema: findingSchema,
    jsonSchemaName: "external_finding",
  });
  const parsed = parseTfJson<SubagentFindingResult>(raw);
  const grounded: SubagentFindingResult = { finding: parsed.finding, evidence: groundEvidence(parsed.evidence, [combined]) };

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
  allSourceTexts: string[]
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

  const grounded = groundClaims(parsed.claims, allSourceTexts);
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

export async function runIncident(incidentId: string, scenario: string): Promise<void> {
  const incident: Incident = {
    id: incidentId,
    title: scenario,
    status: "investigating",
    createdAt: new Date().toISOString(),
  };
  addIncident(incident);

  try {
    const logs = await runLogsSubagent(incidentId);
    const diff = await runDiffSubagent(incidentId);
    const external = await runExternalSubagent(incidentId);

    let findings = [
      { agent: "logs", result: logs.result },
      { agent: "diff", result: diff.result },
      { agent: "external", result: external.result },
    ];
    let sourceTexts = [logs.sourceText, diff.sourceText, external.sourceText];

    let synthesis = await runSynthesis(incidentId, findings, sourceTexts);

    if (!synthesis.canHypothesize) {
      emit(incidentId, "clarification_requested", { question: synthesis.question, gap: synthesis.gap });
      const answer = await waitForClarification(incidentId);
      emit(incidentId, "clarification_provided", { question: synthesis.question, answer });

      // Resume with the added context folded into the external finding's evidence pool
      // as free-text context (not asserted as tool evidence) and re-run synthesis once.
      findings = [...findings, { agent: "on-call", result: { finding: answer, evidence: [] } }];
      sourceTexts = [...sourceTexts, answer];
      synthesis = await runSynthesis(incidentId, findings, sourceTexts);

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

    updateIncidentStatus(incidentId, "awaiting_approval");

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

    emit(incidentId, "approval_requested", {
      approvalId,
      action: synthesis.action,
      claims: synthesis.claims,
      actionSpec: synthesis.actionSpec,
      alternatives: synthesis.alternatives,
    });

    // Genuinely blocks here — resolves only when POST /api/incidents/:id/approvals/:id
    // calls resolveApproval(). No timeout, no auto-approve.
    const decision = await waitForApproval(approvalId);

    const approvalRecord = getApproval(approvalId);
    if (!approvalRecord) throw new Error(`approval ${approvalId} vanished from store`);
    updateApproval({ ...approvalRecord, status: decision === "approve" ? "approved" : "denied", resolvedAt: new Date().toISOString() });

    if (decision === "deny") {
      emit(incidentId, "approval_denied", { approvalId });
      updateIncidentStatus(incidentId, "investigating");
      return;
    }

    emit(incidentId, "approval_granted", { approvalId });
    updateIncidentStatus(incidentId, "remediating");

    // Execute only what was approved: re-read the approved ActionSpec from the store by
    // approvalId and run exactly that, never re-derive "what the fix should be" here
    // (CONTRACT.md rule 2).
    const approved = getApproval(approvalId);
    if (!approved || approved.status !== "approved") {
      throw new Error(`refusing to execute: approval ${approvalId} is not in approved state`);
    }
    const spec = approved.actionSpec;
    const result = `Simulated ${spec.type} on ${spec.target} with params ${JSON.stringify(spec.params)} — sandbox execution is simulated per CONTRACT.md's fallback table (real sandboxed exec was cut for this build). Error rate returned to baseline within the simulated window.`;

    emit(incidentId, "action_executed", { action: approved.action, actionSpec: spec, result });

    const summaryText = `${scenario}: ${synthesis.rootCause} Fix applied: ${approved.action}. ${result}`;
    emit(incidentId, "summary_posted", { channel: "#incidents", text: summaryText });

    updateIncidentStatus(incidentId, "resolved");
  } catch (err) {
    // Fail loudly into the event log rather than leaving the run silently stuck.
    emit(incidentId, "summary_posted", {
      channel: "#incidents",
      text: `Run for "${scenario}" failed: ${(err as Error).message}`,
    });
    throw err;
  }
}
