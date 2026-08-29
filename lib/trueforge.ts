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
  return withRetry(async () => {
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
              config: { iteration_limit: 4 },
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
    const sessionId: string = sessionJson.data.id;

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
    const turnId: string = turnJson.data.id;

    let attempts = 0;
    while (attempts < MAX_POLL_ATTEMPTS) {
      const getRes = await fetchWithTimeout(
        `${TF_BASE}/api/v1/sessions/${sessionId}/turns/${turnId}`,
        { method: "GET" },
        REQUEST_TIMEOUT_MS
      );
      if (!getRes.ok) {
        throw new Error(`TrueForge getTurn failed: ${getRes.status} ${await getRes.text()}`);
      }
      const getJson = await getRes.json();
      const state = getJson.data.state;
      if (state.status === "done") {
        const content = state.output?.content;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
          return content
            .filter((p: { type?: string; text?: string }) => p?.type === "text")
            .map((p: { text?: string }) => p.text ?? "")
            .join("");
        }
        throw new Error("TrueForge turn done with no output content");
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
  });
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
