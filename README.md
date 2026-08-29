# Snitch

Built for the Agent Harness Hackathon (Aug 29, 2026) — Best Use of the Agent Harness, Best Use
of Bright Data, and Best Code Quality tracks.

An alert fires → three subagents investigate in parallel (logs, diff, and a live external check
via Bright Data against the real dependency's GitHub changelog and GitHub's status page) → the
harness proposes a root-cause hypothesis where every claim traces to a real, verbatim piece of
evidence from an actual tool call → a human approval gate blocks any remediation until a person
signs off → the approved action executes. See `CONTRACT.md` for the full schema and the
differentiator this project is actually betting on: evidence-per-claim, not just an approval
gate (every competitor already has one of those).

**What's real vs. simulated, stated plainly**: `logs` and `diff` read from a fixed, documented
fixture (`lib/simTools.ts`) — there's no real production system behind this demo to query, and
that's stated in the code, not hidden. The model's *reasoning* over that fixture is real, not
scripted. What's genuinely live every time: the `external` subagent's Bright Data scrapes, the
approval gate (TrueForge's own native pause/resume, adversarially tested — see BOARD.tsv item 19
and the PR's Qodo review), and the executed action's result. "Posts a summary" logs an event; it
is not wired to a real Slack webhook.

Built with [TrueForge](https://trueforge.dev) as the agent harness, OpenAI as the model
provider, and [Bright Data](https://brightdata.com) for the live external evidence check.

## Setup

See `CLAUDE.md` for the full project rules, stack, and BOARD.tsv coordination protocol used to
build this. Key one-time setup:

- TrueForge: `npx @truefoundry/trueforge`, configure OpenAI under Settings → Models.
- Bright Data: `npx -p @brightdata/cli`, then `bdata login`.
- Qodo: installed as a GitHub App on this repo (Integrations → SaaS → GitHub) — required for the
  Code Quality track. Non-trivial changes go through a PR so Qodo reviews them before merge.

## Qodo Code Review Evidence

Qodo auto-reviewed [PR #1](https://github.com/TriNguyen1110/aug29/pull/1) (merged into `main`) —
across two review passes as the branch grew, it found 17 total findings (bugs + rule violations)
against a full-codebase read, not just the diff, and 14 were fixed/dismissed before merge.

The most important one: after the approval gate was rewired to TrueForge's native gated-tool
mechanism, Qodo caught a real security regression — the exposed `execute_remediation` MCP
endpoint executed caller-supplied action fields without checking them against the actual
approved `Approval`/`ActionSpec`, meaning a direct call to that endpoint (bypassing TrueForge's
session entirely) could have run an unapproved remediation. Fixed by validating the approval
record and doing an exact deep-equal against the stored `ActionSpec` at the execution boundary
itself — then verified independently by writing a direct MCP client and adversarially attacking
the endpoint (pending approval, fake approval ID, mismatched action, exact match) to confirm no
bypass exists.

Other real findings fixed: `groundEvidence` accepted a claim's excerpt if it matched *any* source
text, without checking it actually came from the claimed `source`/`ref` (a real hole in the
evidence-per-claim guarantee); a failed run's `summary_posted` event was read by the UI as
"resolved"; a `tool_call` audit event truncated scraped content to 4,000 characters while
synthesis/grounding read the full raw text, so a claim could cite content invisible in the
persisted log; a remediation failure left the incident status permanently stuck; and a few
smaller reliability/test-script issues. Lower-severity findings (a caching-layer rule for a
polling GET, unknown-event-type rendering robustness, a BOARD.tsv audit-trail formatting nitpick)
were dismissed with a stated reason as out of scope for a one-day hackathon build.
