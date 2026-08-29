# Contract — frozen for the day

This is the schema and API shape backend and frontend both build against. Do not change without
stopping and flagging it — a change here breaks whoever's building in parallel.

## Product shape

An "incident" is simulated, not real infra. A trigger creates one, the harness (subagents +
approval gate + sandbox) works it, and every step it takes is a row the frontend can render live.

## The actual differentiator — read this before building anything

Market research confirmed "investigate → hypothesize → approval gate → execute" is already the
industry-standard architecture (Cleric, Resolve.ai, Traversal, Rootly, incident.io, FireHydrant
all ship some version of this today). The approval gate alone is table stakes, not a pitch.

The open gap: none of those competitors make the *hypothesis itself* auditable per-claim.
Cleric stays deliberately read-only specifically because trust in agent-asserted root causes is
still unsolved industry-wide. This project's actual claim to judges is: every claim in the
hypothesis traces to the exact tool-call output it came from, and the approval screen shows that
evidence, not a plain fix description. If a claim has no backing evidence, the agent has to say
so rather than assert it. This is the demo's centerpiece — build it before polishing anything else.

## Data model

```ts
type Incident = {
  id: string
  title: string          // e.g. "Checkout API error rate spike"
  status: "investigating" | "awaiting_approval" | "remediating" | "resolved"
  createdAt: string       // ISO
}

type IncidentEvent = {
  id: string
  incidentId: string
  ts: string              // ISO
  type:
    | "subagent_start"        // payload: { agent: "logs" | "diff" | "external", task: string, allowedTools: string[] }
    | "tool_call"              // payload: { agent: "logs" | "diff" | "external", tool: string, input: string, output: string }
    | "subagent_result"        // payload: { agent: "logs" | "diff" | "external", finding: string, evidence: Evidence[] }
    | "scrape_issue"           // payload: { targetUrl: string, collectorId: string, cause: "selector_drift" | "bot_wall" | "rate_limit" | "network" | "unknown", note: string }
    | "scrape_repaired"        // payload: { targetUrl: string, collectorId: string, note: string }
    | "clarification_requested" // payload: { question: string, gap: string }
    | "clarification_provided"  // payload: { question: string, answer: string }
    | "hypothesis"             // payload: { rootCause: string, proposedFix: string, claims: Claim[] }
    | "approval_requested"     // payload: { approvalId: string, action: string, claims: Claim[], actionSpec: ActionSpec, alternatives: Alternative[] }
    | "approval_granted"       // payload: { approvalId: string }
    | "approval_denied"        // payload: { approvalId: string }
    | "action_executed"        // payload: { action: string, actionSpec: ActionSpec, result: string }
    | "summary_posted"         // payload: { channel: string, text: string }
  payload: Record<string, unknown>
}

// The one thing the executor is allowed to run. Execution must diff-check the actionSpec it's
// about to run against the one that was actually approved (by approvalId) before running it —
// never re-derive or reinterpret "what the fix should be" at execution time.
type ActionSpec = {
  type: "rollback" | "restart" | "toggle_flag"
  target: string        // e.g. "checkout-service"
  params: Record<string, string>  // e.g. { commit: "a1b2c3" }
}

// An option the agent considered and didn't recommend, shown alongside the recommended one so
// the human approving isn't just seeing one flat suggestion.
type Alternative = {
  description: string   // e.g. "Restart the service instead of rolling back"
  tradeoff: string       // e.g. "Faster, but the underlying bad commit stays deployed and can recur"
}

// Every source a subagent actually pulled from. This is what makes a finding checkable
// instead of asserted — it must point at real, specific tool output, never a paraphrase.
type Evidence = {
  source: "log" | "diff" | "commit" | "external"
  ref: string           // e.g. "checkout-service.log:1442", "commit a1b2c3, line 88", or
                          // "https://status.example.com, collector c_9f2, fetched 2026-08-29T14:02Z"
  excerpt: string        // the literal substring/line pulled from that source, verbatim
}

// One statement in the hypothesis, tied to the evidence backing it. If a statement has no
// evidence, `evidence` is an empty array and the agent must say so explicitly in `text`
// ("no direct evidence found for this, inferred from timing correlation only") rather than
// presenting it with the same confidence as a backed claim.
type Claim = {
  text: string
  evidence: Evidence[]
}

type Approval = {
  id: string
  incidentId: string
  action: string           // human-readable: "Roll back commit a1b2c3 on checkout-service"
  actionSpec: ActionSpec   // structured, exact — this and only this is what execution runs
  claims: Claim[]          // the evidence-backed reasoning behind this specific action
  alternatives: Alternative[]  // other options considered, with tradeoffs, not just the pick
  status: "pending" | "approved" | "denied"
  requestedAt: string
  resolvedAt: string | null
}
```

**The rule this schema exists to enforce:** a `Claim` with an empty `evidence` array is not
a failure, an unbacked claim presented as if it had evidence is. Backend and the harness call
that produces claims must never fabricate an `Evidence.excerpt` — it has to be a real substring
from a real subagent's tool output, checked by the verifier the same way the old grounding rule
checked quotes against source posts.

## The third subagent — real external evidence via Bright Data

Alongside the `logs` and `diff` investigators, a third subagent (`external`) pulls live evidence
from outside the codebase: the relevant vendor's status page, a dependency's changelog/release
notes, or a related public postmortem, scraped via the Bright Data CLI (see CLAUDE.md's "Bright
Data" section for exact commands). This is not decoration — it's what makes a hypothesis like
"this correlates with the upstream provider's incident at 14:02 UTC" checkable instead of
asserted, and it's the genuine tie-in for the Bright Data track (a real pipeline that notices and
repairs itself, not a hardcoded parser hit once).

- Every scrape response is cached to `./data/raw/` before parsing, same as any other fetch.
- If a scrape comes back with zero/short records, the run emits `scrape_issue` (cause guessed
  from the response shape — bot-wall vs. empty selector vs. rate limit) instead of silently
  treating it as "no external evidence found." `scrape-doctor` picks this up, runs
  `bdata scraper heal`, and once a human approves the fix, the run emits `scrape_repaired`.
- `external`'s tool allowlist is exactly the Bright Data scrape tool and nothing else — same
  scoped-access rule as the other two subagents (rule 1 below).
- If external scraping is broken and can't be healed in time, fall back per CONTRACT.md's
  fallback table below — never fabricate what a status page or changelog "would have said."

## Five product rules — non-negotiable, checked by the verifier

1. **Scoped access.** Each subagent's tool allowlist is declared in its `subagent_start` event
   (`allowedTools`) and enforced in code, not just prompted. The logs subagent never gets a git
   tool; the diff subagent never gets a log-query tool; the external subagent gets only the
   Bright Data scrape tool. None of the three gets a write/exec tool at all — only the
   post-approval executor does, and only for the one approved `ActionSpec`.
2. **Execute only what was approved.** The executor must check the `ActionSpec` it's about to
   run against the one stored on the approved `Approval` (matched by `approvalId`) before
   running it. Never let the model re-derive "what the fix should be" at execution time — it
   runs the stored spec, verbatim, or not at all.
3. **Log everything, not just headline events.** Every tool call a subagent makes gets a
   `tool_call` event (tool, input, output), not just the summarized `subagent_result`. The audit
   trail should let someone reconstruct the entire investigation from the event log alone.
4. **Surface tradeoffs, not one flat suggestion.** `approval_requested` always carries
   `alternatives` — at least one other option the agent considered and why it wasn't picked.
   An approval with an empty `alternatives` array is a sign the agent didn't actually consider
   options, not a sign there weren't any.
5. **Ask instead of assuming.** If the two subagents' findings don't give enough evidence to
   name a root cause with at least one backed `Claim`, the run emits `clarification_requested`
   and pauses — it does not force a low-confidence hypothesis just to keep moving. The demo
   script should include triggering this at least once, since "the agent knows what it doesn't
   know" is as much a harness-quality signal as the approval gate is.

## API routes (backend owns; frontend builds against these shapes from hour one)

- `POST /api/incidents/trigger` — body `{ scenario: string }`, starts a run, returns `{ incidentId }`.
  This is the "alert fires" button on the demo.
- `GET /api/incidents` — list, most recent first. Seeded with 1-2 fake past incidents so the
  dashboard never looks empty before the live demo run.
- `GET /api/incidents/:id` — current `Incident` plus its full `IncidentEvent[]` so far.
- `GET /api/incidents/:id/stream` — SSE. Emits a JSON `IncidentEvent` per line as the harness
  produces one. Frontend renders the timeline off this, not polling, so the demo looks live.
- `POST /api/incidents/:id/approvals/:approvalId` — body `{ decision: "approve" | "deny" }`.
  This is the human-approval gate the harness pauses on. Resolving it lets the run continue.
- `POST /api/incidents/:id/clarifications` — body `{ question: string, answer: string }`.
  Resolves a `clarification_requested` event (rule 5) and lets investigation resume with the
  added context.

## Seed data

Backend seeds two past `Incident` rows (status `resolved`) with a full event history each, so
`GET /api/incidents` never returns an empty list before you've triggered a live one on stage.
Frontend builds the incident list and detail view against these from the start — never blocks
waiting for a real harness run to exist.

## Fallback table

| Blocked on | Take this instead |
|---|---|
| Real MCP/OAuth connection to Slack flaking | Hardcode a mock "Slack" panel in the frontend that renders the posted summary; log the real webhook call if it works, don't gate the demo on it |
| Harness subagent delegation not wired by hour 3 | Fake the three subagent calls as sequential model calls with a hardcoded 1-2s delay between events, keep the event shapes identical so frontend/judges can't tell the difference in the timeline |
| Sandbox execution (real command) unreliable | The "action_executed" event can report a canned, clearly-labeled simulated result — judges care that the approval gate is real, not that the shell command is real |
| Bright Data scrape target itself is unreachable (not a structure change, actual outage/blocked) | Replay the last cached response from `./data/raw/` for that collector, label the `external` evidence as "from cached scrape, not live," never fabricate a fresh excerpt |
| `bdata scraper heal` doesn't produce a working fix in time | Emit `scrape_issue` and leave it `open` on screen rather than hiding it — an honestly-reported broken scraper is a smaller loss than pretending external evidence exists when it doesn't |

Cut order if time runs short: real Slack post → real sandboxed exec → real subagent parallelism
→ never cut the approval gate, the live event timeline, or evidence-per-claim on the approval
screen (including the external/Bright Data evidence once it's wired). Those three are the whole
demo — the first two are what any competitor already has, the third is the actual pitch, and the
external evidence subagent is what makes the Bright Data track judging criteria real rather than
bolted on.
