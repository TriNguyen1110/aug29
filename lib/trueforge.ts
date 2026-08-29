// Thin client for the TrueForge harness REST API (CLAUDE.md "Stack" section).
// Each subagent call and the final hypothesis/synthesis call is a real, separate
// session + turn against this local server (http://localhost:8790) — not a mocked call.
//
// Runtime is capped: every session/turn call has a request timeout and the poll loop
// for turn completion has a max-attempts cap. No unbounded loops (backend agent rule).

const TF_BASE = process.env.TRUEFORGE_URL ?? "http://localhost:8790";

const REQUEST_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_ATTEMPTS = 60; // 60s cap per turn
const MAX_RETRIES = 1;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Retries only ONE step at a time (session create, turn create, or a single poll GET) —
// never the whole session+turn+poll workflow. Wrapping the entire workflow (the original
// shape of this helper) meant a transient failure partway through re-ran everything from
// scratch, creating orphaned sessions and duplicate model turns (Qodo PR #1 finding,
// BOARD.tsv H+2.2d). Callers pass already-created ids into later steps so a retry resumes
// from where it actually failed instead of restarting.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export type TfJsonSchema = Record<string, unknown>;

// Creates a session bound to an inline agent spec, then runs exactly one turn with the
// given user message and polls until the turn is done. Returns the raw text content of
// the model's final message (expected to be JSON when jsonSchema is supplied).
export async function runTfTurn(opts: {
  model: string; // e.g. "openai/gpt-5-4-mini" or "openai/gpt-5-5"
  instructions: string;
  userMessage: string;
  jsonSchema?: TfJsonSchema;
  jsonSchemaName?: string;
  strict?: boolean; // default true; set false for schemas with open-ended (dictionary-shaped) fields
}): Promise<string> {
  // Step 1: create the session. Safe to retry on its own — a failed attempt never
  // returned an id, so nothing is orphaned by trying again.
  const sessionId: string = await withRetry(async () => {
    const sessionRes = await fetchWithTimeout(
      `${TF_BASE}/api/v1/sessions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent: {
            spec: {
              model: { name: opts.model },
              instructions: opts.instructions,
              ...(opts.jsonSchema
                ? {
                    response_format: {
                      type: "json_schema",
                      json_schema: {
                        name: opts.jsonSchemaName ?? "result",
                        schema: opts.jsonSchema,
                        strict: opts.strict ?? true,
                      },
                    },
                  }
                : {}),
              // Explicitly disable the harness's built-in "ask a clarifying question"
              // capability for these one-shot structured-JSON calls: this code path
              // expects exactly one final message matching jsonSchema and has no handling
              // for a turn pausing mid-flight on a system-level question instead (that
              // showed up live as "TrueForge turn done with no output content" — a
              // required_action, not a real error, that this call site isn't built to
              // resume). Our own clarification_requested/clarification_provided flow
              // (CONTRACT.md rule 5) is the intentional, handled version of this at the
              // runIncident level; the harness's own mid-turn question prompt is not.
              config: { iteration_limit: 4, ask_user_questions: { enabled: false } },
            },
          },
        }),
      },
      REQUEST_TIMEOUT_MS
    );
    if (!sessionRes.ok) {
      throw new Error(`TrueForge createSession failed: ${sessionRes.status} ${await sessionRes.text()}`);
    }
    const sessionJson = await sessionRes.json();
    return sessionJson.data.id;
  });

  // Step 2: create the turn on that ONE session. If this fails partway through a retry
  // attempt, we still only ever have the one session from step 1 — never a second,
  // orphaned session — because retrying here does not re-run step 1.
  const turnId: string = await withRetry(async () => {
    const turnRes = await fetchWithTimeout(
      `${TF_BASE}/api/v1/sessions/${sessionId}/turns`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: [{ type: "user.message", content: opts.userMessage }],
          stream: false,
        }),
      },
      REQUEST_TIMEOUT_MS
    );
    if (!turnRes.ok) {
      throw new Error(`TrueForge createTurn failed: ${turnRes.status} ${await turnRes.text()}`);
    }
    const turnJson = await turnRes.json();
    return turnJson.data.id;
  });

  // Step 3: poll that ONE turn until done. Each GET is independently idempotent — retrying
  // a single failed GET (inside withRetry) never creates a new turn, and the outer while
  // loop just keeps checking the same turnId.
  let attempts = 0;
  while (attempts < MAX_POLL_ATTEMPTS) {
    const state = await withRetry(async () => {
      const getRes = await fetchWithTimeout(
        `${TF_BASE}/api/v1/sessions/${sessionId}/turns/${turnId}`,
        { method: "GET" },
        REQUEST_TIMEOUT_MS
      );
      if (!getRes.ok) {
        throw new Error(`TrueForge getTurn failed: ${getRes.status} ${await getRes.text()}`);
      }
      const getJson = await getRes.json();
      return getJson.data.state;
    });

    if (state.status === "done") {
      const content = state.output?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter((p: { type?: string; text?: string }) => p?.type === "text")
          .map((p: { text?: string }) => p.text ?? "")
          .join("");
      }
      throw new Error(
        `TrueForge turn done with no output content (required_actions: ${JSON.stringify(state.required_actions ?? [])}) — this call site does not resume paused turns`
      );
    }
    if (state.status === "error") {
      throw new Error(`TrueForge turn errored: ${state.message}`);
    }
    if (state.status === "cancelled") {
      throw new Error("TrueForge turn was cancelled");
    }
    attempts += 1;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`TrueForge turn did not complete within ${MAX_POLL_ATTEMPTS}s`);
}

// Best-effort JSON parse of a model's structured-output response. Throws with the raw
// text included so callers can log/handle it rather than silently swallowing a bad parse.
export function parseTfJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`Failed to parse TrueForge JSON output: ${(err as Error).message}. Raw: ${text.slice(0, 500)}`);
  }
}

// --- item 11: TrueForge's NATIVE gated-tool approval primitive --------------------------
// The remediation action (ActionSpec) is exposed to TrueForge as a real MCP tool
// (app/api/mcp/remediation/route.ts, hosted in-process on this same app) marked
// `require_approval_for_tools`. When the model calls it, TrueForge itself pauses the turn
// (`tool.approval_required`) — that pause, not our own Promise, is the real enforcement.
// Resuming is a new turn with a `user.tool_approval` input item. lib/harness.ts translates
// the pause into the existing `approval_requested` IncidentEvent (byte-identical shape to
// before) and the resume into `approval_granted`/`approval_denied` + `action_executed`.

const REMEDIATION_MCP_NAME = "incident_remediation";
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";
const REMEDIATION_MCP_URL = `${APP_BASE_URL}/api/mcp/remediation`;

type TfRequiredAction = {
  type: "tool.approval_required" | "tool.response_required" | "mcp.auth_required";
  thread_id: string;
  tool_calls: { id: string; source_event_id: string }[];
};

type TfTurn = {
  id: string;
  session_id: string;
  state:
    | { status: "running" }
    | {
        status: "done";
        output: { content: string | Array<{ type?: string; text?: string }> | null } | null;
        required_actions: TfRequiredAction[];
      }
    | { status: "error"; message?: string }
    | { status: "cancelled" };
};

let remediationMcpServerRegistered = false;

// Registers our MCP server with TrueForge once (idempotent: a 409 "already exists" is
// treated as success, not an error — this can be called on every run cheaply after the
// first).
export async function ensureRemediationMcpServer(): Promise<void> {
  if (remediationMcpServerRegistered) return;
  const res = await fetchWithTimeout(
    `${TF_BASE}/api/v1/settings/mcp-servers`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manifest: {
          type: "remote",
          name: REMEDIATION_MCP_NAME,
          url: REMEDIATION_MCP_URL,
          description:
            "Executes an approved incident remediation action (rollback, restart, or toggle_flag) " +
            "exactly as specified. Every call requires human approval.",
        },
      }),
    },
    REQUEST_TIMEOUT_MS
  );
  if (!res.ok && res.status !== 409) {
    throw new Error(`ensureRemediationMcpServer failed: ${res.status} ${await res.text()}`);
  }
  remediationMcpServerRegistered = true;
}

async function createTurn(sessionId: string, input: unknown[], previousTurnId?: string): Promise<TfTurn> {
  const res = await fetchWithTimeout(
    `${TF_BASE}/api/v1/sessions/${sessionId}/turns`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input, ...(previousTurnId ? { previous_turn_id: previousTurnId } : {}), stream: false }),
    },
    REQUEST_TIMEOUT_MS
  );
  if (!res.ok) throw new Error(`TrueForge createTurn failed: ${res.status} ${await res.text()}`);
  return (await res.json()).data as TfTurn;
}

async function pollTurnUntilDone(sessionId: string, turnId: string): Promise<TfTurn> {
  let attempts = 0;
  while (attempts < MAX_POLL_ATTEMPTS) {
    const res = await fetchWithTimeout(
      `${TF_BASE}/api/v1/sessions/${sessionId}/turns/${turnId}`,
      { method: "GET" },
      REQUEST_TIMEOUT_MS
    );
    if (!res.ok) throw new Error(`TrueForge getTurn failed: ${res.status} ${await res.text()}`);
    const turn = (await res.json()).data as TfTurn;
    if (turn.state.status === "done") return turn;
    if (turn.state.status === "error") throw new Error(`TrueForge turn errored: ${turn.state.message}`);
    if (turn.state.status === "cancelled") throw new Error("TrueForge turn was cancelled");
    attempts += 1;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`TrueForge turn ${turnId} did not complete within ${MAX_POLL_ATTEMPTS}s`);
}

async function getTurnEvents(sessionId: string, turnId: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetchWithTimeout(
    `${TF_BASE}/api/v1/sessions/${sessionId}/turns/${turnId}/events`,
    { method: "GET" },
    REQUEST_TIMEOUT_MS
  );
  if (!res.ok) throw new Error(`TrueForge listTurnEvents failed: ${res.status} ${await res.text()}`);
  return (await res.json()).data as Array<Record<string, unknown>>;
}

export type RemediationActionSpec = { type: string; target: string; params: Record<string, string> };

export type PausedRemediationTurn = {
  sessionId: string;
  turnId: string;
  threadId: string;
  toolCallId: string;
  // The literal `input` the model actually passed to `execute_remediation`, read back from
  // the turn's own event log — never trusted blindly. lib/harness.ts diff-checks this
  // against the stored, approved ActionSpec before ever allowing the resume (CONTRACT.md
  // rule 2: execute only what was approved, verbatim).
  calledInput: { incidentId?: string; approvalId?: string; type?: string; target?: string; params?: Record<string, string> } | null;
};

type TfMessageOutput = { content: string | Array<{ type?: string; text?: string }> | null } | null;

function extractTfMessageText(output: TfMessageOutput): string {
  if (!output) return "";
  if (typeof output.content === "string") return output.content;
  if (Array.isArray(output.content)) {
    return output.content
      .filter((p) => p?.type === "text")
      .map((p) => p.text ?? "")
      .join("");
  }
  return "";
}

// Starts a real, separate TrueForge session bound to an agent whose only tool is the
// gated `execute_remediation` MCP tool, and drives it to call that tool with the exact
// literal ActionSpec fields given (never let the model re-derive them). Returns the paused
// state once TrueForge itself emits `tool.approval_required` — this is the harness's own
// pause, not ours.
export async function startRemediationTurn(opts: {
  model: string;
  incidentId: string;
  approvalId: string;
  actionSpec: RemediationActionSpec;
}): Promise<PausedRemediationTurn> {
  await ensureRemediationMcpServer();

  const sessionRes = await fetchWithTimeout(
    `${TF_BASE}/api/v1/sessions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agent: {
          spec: {
            model: { name: opts.model },
            instructions:
              "You are the incident-remediation executor. You will be given the exact approved " +
              "incidentId, approvalId, and actionSpec (type, target, params) as JSON in the user " +
              "message. Call the execute_remediation tool exactly once with those literal values " +
              "copied verbatim — never invent, infer, round, or alter any field. Do not call any " +
              "other tool. After the tool call resolves, reply with a one-sentence confirmation.",
            mcp_servers: [
              {
                name: REMEDIATION_MCP_NAME,
                enable_tools: ["execute_remediation"],
                require_approval_for_tools: ["execute_remediation"],
              },
            ],
            // Disable the built-in "ask a clarifying question" capability here too — this
            // agent's only job is to call one deterministic tool with literal values we
            // already gave it; a mid-turn question pause would break startRemediationTurn's
            // assumption that "done" always means either a final message or the one gated
            // tool.approval_required pause it knows how to handle.
            config: { iteration_limit: 4, ask_user_questions: { enabled: false } },
          },
        },
      }),
    },
    REQUEST_TIMEOUT_MS
  );
  if (!sessionRes.ok) throw new Error(`TrueForge createSession (remediation) failed: ${sessionRes.status} ${await sessionRes.text()}`);
  const sessionId: string = (await sessionRes.json()).data.id;

  const userMessage = JSON.stringify({
    incidentId: opts.incidentId,
    approvalId: opts.approvalId,
    type: opts.actionSpec.type,
    target: opts.actionSpec.target,
    params: opts.actionSpec.params,
  });
  const created = await createTurn(sessionId, [{ type: "user.message", content: userMessage }]);
  const turn = await pollTurnUntilDone(sessionId, created.id);

  if (turn.state.status !== "done") throw new Error(`unexpected non-done turn state: ${turn.state.status}`);
  const pending = turn.state.required_actions.find((a) => a.type === "tool.approval_required");
  if (!pending || pending.tool_calls.length === 0) {
    const finalText = extractTfMessageText(turn.state.output);
    throw new Error(
      `TrueForge remediation turn completed WITHOUT pausing for a gated tool approval (final message: ${JSON.stringify(finalText)}) — the native approval primitive did not trigger`
    );
  }
  const toolCall = pending.tool_calls[0];

  // Read back the literal arguments the model actually passed, from the turn's own event
  // log (the model.message event referenced by source_event_id), so harness.ts can verify
  // them against the approved ActionSpec before ever allowing the resume.
  const events = await getTurnEvents(sessionId, turn.id);
  let calledInput: PausedRemediationTurn["calledInput"] = null;
  const sourceEvent = events.find((e) => e.id === toolCall.source_event_id) as
    | { tool_calls?: { id: string; function?: { arguments?: string } }[] }
    | undefined;
  const rawCall = sourceEvent?.tool_calls?.find((tc) => tc.id === toolCall.id);
  if (rawCall?.function?.arguments) {
    try {
      const parsedArgs = JSON.parse(rawCall.function.arguments) as { input?: PausedRemediationTurn["calledInput"] };
      calledInput = parsedArgs.input ?? null;
    } catch {
      calledInput = null;
    }
  }

  return { sessionId, turnId: turn.id, threadId: pending.thread_id, toolCallId: toolCall.id, calledInput };
}

// Resumes a paused remediation turn with a real human decision. On "approve", the tool
// genuinely executes inside TrueForge (our MCP server's execute_remediation handler runs
// for real) and this returns the tool's actual response content read back from the turn's
// event log — proof the result came from the harness executing it, not from us
// recomputing it ourselves. On "deny", the model's final message is returned instead and
// nothing executes.
export async function resumeRemediationTurn(opts: {
  sessionId: string;
  turnId: string;
  threadId: string;
  toolCallId: string;
  decision: "approve" | "deny";
  denyReason?: string;
}): Promise<{ resultText: string }> {
  const approval =
    opts.decision === "approve"
      ? { status: "allow" as const }
      : { status: "deny" as const, reason: opts.denyReason ?? "Denied by the on-call engineer via the approval gate." };

  const created = await createTurn(
    opts.sessionId,
    [{ type: "user.tool_approval", thread_id: opts.threadId, tool_call_id: opts.toolCallId, approval }],
    opts.turnId
  );
  const turn = await pollTurnUntilDone(opts.sessionId, created.id);
  if (turn.state.status !== "done") throw new Error(`unexpected non-done turn state: ${turn.state.status}`);

  if (opts.decision === "deny") {
    return { resultText: extractTfMessageText(turn.state.output) || "Remediation call denied." };
  }

  const events = await getTurnEvents(opts.sessionId, turn.id);
  const toolResponse = events.find((e) => e.type === "tool.response" && e.tool_call_id === opts.toolCallId) as
    | { content?: string }
    | undefined;
  if (!toolResponse?.content) {
    throw new Error("Approved remediation turn completed with no tool.response event — execution did not actually run through the harness");
  }
  return { resultText: toolResponse.content };
}
