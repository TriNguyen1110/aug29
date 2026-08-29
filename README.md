# Snitch

Built for the Agent Harness Hackathon (Aug 29, 2026) — Best Use of the Agent Harness, Best Use
of Bright Data, and Best Code Quality tracks.

An alert fires → three subagents investigate in parallel (logs, diff, and live external evidence
via Bright Data — vendor status pages / dependency changelogs) → the harness proposes a
root-cause hypothesis where every claim traces to a real, verbatim piece of evidence from an
actual tool call → a human approval gate blocks any remediation until a person signs off →
the approved action runs in a sandbox → a summary posts to Slack. See `CONTRACT.md` for the full
schema and the differentiator this project is actually betting on: evidence-per-claim, not just
an approval gate (every competitor already has one of those).

Built with [TrueForge](https://trueforge.dev) as the agent harness, OpenAI as the model
provider, and [Bright Data](https://brightdata.com) for live external evidence with a
self-healing scraper (`bdata scraper heal`) when a target site's structure changes.

## Setup

See `CLAUDE.md` for the full project rules, stack, and BOARD.tsv coordination protocol used to
build this. Key one-time setup:

- TrueForge: `npx @truefoundry/trueforge`, configure OpenAI under Settings → Models.
- Bright Data: `npx -p @brightdata/cli`, then `bdata login`.
- Qodo: installed as a GitHub App on this repo (Integrations → SaaS → GitHub) — required for the
  Code Quality track. Non-trivial changes go through a PR so Qodo reviews them before merge.

## Qodo Code Review Evidence

Qodo auto-reviewed [PR #1](https://github.com/TriNguyen1110/aug29/pull/1) (the branch that added
the real harness run, approval gate, and evidence UI) and found 7 real bugs plus 6 rule
violations against a full-codebase read, not just the diff. Highlights actually addressed before
merge: the trigger's `scenario` text was being ignored by every subagent (always investigated the
fixed checkout/Stripe fixture regardless of input); `groundEvidence` accepted a claim's excerpt if
it matched *any* source text, without checking it actually came from the claimed `source`/`ref`
(a real hole in the evidence-per-claim guarantee); a failed run's `summary_posted` event was being
read by the UI as "resolved"; and a `tool_call` audit event truncated scraped content to 4,000
characters while synthesis/grounding read up to the full raw text, so a claim could cite content
invisible in the persisted log. Lower-severity findings (a caching-layer rule for a new polling
GET, unknown-event-type rendering robustness) were dismissed as out of scope for a one-day
hackathon build per `CLAUDE.md`'s own no-premature-infra convention.
