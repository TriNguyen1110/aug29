# Project rules

## Build constraint, read this first

This is a 6 hour hackathon build (Agent Harness Hackathon). Demo grade, not production. Working
beats complete, and shipped beats correct in the abstract. Target: Best Use of the Agent Harness
track — the harness (subagents, human approvals, sandboxed execution, session persistence, MCP
connections) has to visibly be doing the work, not sitting under a thin wrapper.

- No abstractions for future reuse. Write the specific thing.
- No refactoring. If it works and is ugly, leave it.
- No auth, no billing, no onboarding, no empty states beyond one line of text.
- Error handling only where it protects the demo: cache every fetch, assert record counts,
  and fail loudly. Everywhere else, let it throw.
- No new dependencies unless one saves more than thirty minutes.
- If the choice is between shipping something plain and not shipping, ship plain.
- If a piece is not working after 45 minutes, say so and take a documented fallback instead
  of continuing.

Scope is fixed and the clock is not. When in doubt, cut. See CONTRACT.md's fallback table for
the specific cut order — never cut the approval gate or the live event timeline, those are the
whole demo.

## Stack

- Model provider: OpenAI (spend the $50 hackathon credit), configured in TrueForge under
  Settings → Models.
- Harness: TrueForge. `npx @truefoundry/trueforge` (Node 22+), UI at `http://localhost:8790`,
  local mode persists sessions to SQLite. Configure once at the start of the day: Settings →
  Models (OpenAI key), Settings → Connectors (MCP servers, including Bright Data's if it's
  exposed as one), Settings → Sandbox providers (Daytona, for the post-approval executor).
  Automation from our own backend goes through the TypeScript SDK `@truefoundry/trueforge-core`
  or the REST+SSE API (`/api/v1/docs`) — everything in CONTRACT.md is a plain event-log shape so
  swapping how we call the harness never touches the contract.
- Third evidence subagent: pulls real external signals (vendor status pages, dependency
  changelogs, a related public postmortem) via Bright Data — see "Bright Data" section below.
  This is what makes the Bright Data track judging criteria genuine instead of bolted on.
- Backend: Node, one process, in-memory or single SQLite file for incidents/events. No separate
  DB service.
- Frontend: Next.js. Talks to backend only through the routes in CONTRACT.md.
- No auth, no deploy pipeline. Runs on localhost for the demo.

## Bright Data

Real setup, not simulated — this is a judged criterion on its own track.

**Watch targets (external-evidence subagent), fixed for this build:**

The original targets were `status.stripe.com` and `docs.stripe.com/changelog` — the direct "is it
us or Stripe" check for the seeded *"Checkout API error rate spike"* demo incident. Both are
account-level KYC/compliance-blocked on this Bright Data account (financial-services domains
require KYC approval; see BOARD.tsv item 06 fact rows for the real, live-verified `Forbidden`
error) and were swapped for two real, ungated targets that play the same roles:

| Target | URL | Why |
|---|---|---|
| stripe-node releases (Atom feed) | `https://github.com/stripe/stripe-node/releases.atom` | Ties directly to `lib/simTools.ts`'s diff fixture, which already claims the incident was caused by bumping `stripe-node` 14.8.0→17.0.0 — checking the real release feed for that version range is more specific evidence than a generic status page. The plain HTML `releases` page (no `.atom`) fell into Bright Data's slow batch-mode pagination fallback and never returned in testing; the Atom feed is small/unpaginated and returns fast. Known limitation: the auto-generated extraction schema currently only pulls feed metadata, not the actual per-release title/body text — the subagent honestly reports "no release-note text found" rather than fabricating a cause, which is correct behavior, just thinner evidence than ideal. |
| GitHub status | `https://www.githubstatus.com/` | Generic "is a vendor down" signal, same role Stripe's status page played, not gated. Verified live returning real (if currently empty/"all clear") content. |

Demo script this enables: trigger the checkout incident → watch the `external` subagent scrape
both pages live → the hypothesis either cites something concrete from the stripe-node release
feed or GitHub status as a contributing cause, or explicitly states neither shows anything useful
and the cause must be internal — either outcome is a real, evidence-backed answer, not an
assertion.

- CLI: `npx -p @brightdata/cli`, `bdata login` once to connect the terminal to the account.
- Create the external-evidence scraper once, keep its Collector ID (`c_*`) as a `fact` row:
  `bdata scraper create <status-page-or-changelog-URL> "<what to extract, e.g. latest incident/deploy entries>"`.
- Run it per investigation: `bdata scraper run <COLLECTOR_ID> <URL>`, cache the raw response to
  `./data/raw/` before parsing (same caching discipline as everything else in this repo).
- **Self-heal, on camera if possible.** If a target's structure changes and extraction comes back
  empty/short, run `bdata scraper heal <COLLECTOR_ID> "<what broke>"`, review the proposed fix,
  then `bdata scraper approve <COLLECTOR_ID>` (or `--reject` to refine and re-heal). Same
  Collector ID keeps working afterward — no downstream code change needed. This heal→approve
  loop is the demoable "auto-repair" moment the Bright Data track is judging.
- Targets, selectors, and Collector IDs are configuration, not hardcoded per-run — keep them in
  one place (a `data/targets.json` or similar) that `scrape-doctor` and the backend both read, so
  the setup is reusable/version-controlled, not a one-off terminal command.

## Qodo (required for the Code Quality track)

- One team member with GitHub admin installs the integration once: Qodo → Integrations → SaaS →
  GitHub → Add installation → authorize this repo. (Done for this repo.)
- Every non-trivial change goes through a PR, not a direct push to `main` — a direct push doesn't
  count as reviewed. Qodo auto-reviews the PR; comment `/agentic_review` if it doesn't fire.
- Address High-severity findings before merging; dismiss anything else with a one-line reason in
  the PR thread.
- Before submission, add a "Qodo Code Review Evidence" section to the README with a merged PR
  link and 1-2 lines on what Qodo caught and how it was addressed.

**Responsibility split — two separate gates, both required before `main`:** the `verifier`
agent's `done` verdict on BOARD.tsv is an *internal correctness* gate (DATA/SCREEN checks,
grounding, journeys) — it has nothing to do with Qodo and doesn't open or read PRs itself.
**Qodo review is a separate, additional gate**, main-session's job: push the feature branch, open
the PR, wait for/trigger Qodo (`gh pr comment <PR> --body "/agentic_review"` if it doesn't fire on
its own), read its findings (`gh api` or `gh pr view --comments`), address High-severity ones
(dispatch the owning builder with the specific finding, same as a verifier kickback) or dismiss
others with a one-line reason, *then* merge to `main`. Both gates must pass — verifier `done` is
necessary but not sufficient for merge.

## Commands

One Next.js app (App Router, already scaffolded) serves both the console (`app/**`) and the
backend API routes (`app/api/**`) — one process, fixed port 3000, matching the "one process, no
separate DB service" stack rule. Only the main session starts `npm run dev`; agents never launch
their own.

- `npm run dev` — starts the app on port 3000. Main session only.
- `npm run build` — production build, used as the quick sanity/smoke check until a real
  `npm run smoke` script exists (backend agent should add one once there's a seed/API to check).
- `npm run seed` — <!-- backend agent: add this, writes the two seeded past incidents from
  CONTRACT.md -->
- `bdata scraper run <COLLECTOR_ID> <URL>` — one external-evidence scrape pass (see Bright Data
  section above); backend calls this for the third subagent, `scrape-doctor` calls it to
  re-check after a heal.

## BOARD.tsv

**Main-session rule:** every time backend or frontend commits a testable slice and appends a
`review` row, dispatch the verifier for that row's scope before treating it as done. If the
verifier kicks it back to `doing`, dispatch the owning builder with the fix from `note` and
repeat. Never skip from a builder's commit straight to "looks done."

**Push rule:** once the verifier marks an item `done`, the main session pushes to `origin` —
don't let verified work sit local-only. Never push while another agent has uncommitted or
in-flight changes to files alongside it.

All shared state lives in one append-only, tab-separated file. Never edit a line, never rewrite
the file, only append with `>>`. **The last row for a given `kind` + `id` is the current truth.**

```
ts    kind   id             value        owner      scope   note
```

`item` is a unit of work. `value` is its state: `backlog`, `doing`, `review`, `done`, `blocked`,
`delayed`.

`fact` is something already computed that the other agent would otherwise recompute: event
shapes, seed counts, which harness API actually worked.

Read current state with one pass, last row per key wins:

```bash
awk -F'\t' '{r[$2"\t"$3]=$0} END{for(k in r) print r[k]}' BOARD.tsv | sort -t$'\t' -k2,3
```

Who may set what:

| Transition | Who |
|---|---|
| `backlog` -> `doing` | the owning builder, at tick start |
| `doing` -> `review` | the owning builder, after its commit lands |
| `review` -> `done` | **verifier only** |
| `review` -> `doing` | **verifier only**, on a failure, reason in `note` |
| anything -> `blocked` | any agent |
| anything -> `delayed` | the main session only, cutting scope is a human call |
| new `item` in `backlog` | any agent, including the verifier when it finds something |
| any `fact` | any agent |

The invariant that matters: nothing reaches `done` by its own hand.

## Grounding rules

Every `IncidentEvent` rendered on screen must come from an event actually appended by the
backend (real or documented-fallback simulated per CONTRACT.md's fallback table) — never let the
frontend invent timeline content to fill a gap. If an event type is missing, that's a `blocked`
row, not a frontend fabrication.

Run the `verifier` agent before anything goes on screen or into the live demo.

## Conventions

Fail loudly. Assert event counts are greater than zero after a trigger rather than logging a
warning. Keep every step idempotent and resumable — the whole pitch is that a run survives a
refresh, so this isn't optional.

**No hardcoded/canned data on the live-triggered investigation path.** The two seeded past
incidents (item 01) are legitimately static fixtures — they exist so the list is never empty
before a live demo run, and that's the only place static data belongs. Everything produced by a
*live-triggered* incident — subagent findings, evidence excerpts, the hypothesis, claims,
alternatives — must come from a real model call reasoning over real tool output (real log/diff
fixtures, a real Bright Data scrape), never a template string standing in for one, even as a
quick fallback. If a harness call genuinely can't be wired in time, the CONTRACT.md fallback
table's "sequential real model calls with the same event shapes" is fine; a hardcoded/canned
`finding`/`hypothesis`/`Evidence.excerpt` string is not — that's exactly the fabrication rule 
the verifier's grounding checks exist to catch, and shipping it defeats the entire pitch.

**Verifier journey tests must be realistic, not toy.** `tests/journeys.test.mjs` should model
what an actual on-call engineer does with this tool, not a synthetic happy path with no
real-world texture — e.g. the "Checkout API error rate spike" journey should read like someone
plausibly reasoning through a real checkout outage (is it us or Stripe, what's the blast radius,
what would I actually approve here), not a scripted click-sequence that only exists to make an
assertion pass. Cover genuine success cases end to end (trigger → evidence → approval → resolve)
with the same rigor as failure cases — a demo that only proves the unhappy paths work hasn't
proven the product works.

When corrected, add the rule here rather than fixing the same thing twice.

## Lessons carried over from prior builds (main-session responsibilities)

- **Only one dev server, one port, at a time.**
- **Never let an agent `git stash`.** Commit first if a clean tree is needed.
- **A builder pushing to `review` is not verified.** Always dispatch the verifier.
- **Background agent reports can end mid-task.** Check `BOARD.tsv` for the actual verdict row.
- **Push only what's actually verified**, and only when nothing else has in-flight uncommitted
  changes in the same files.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
