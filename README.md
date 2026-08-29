# Incident Responder

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

<!-- Fill in before submission: link to a merged PR Qodo reviewed, and 1-2 lines on what it
caught and how it was addressed. -->
