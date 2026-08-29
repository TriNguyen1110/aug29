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
  GitHub → Add installation → authorize this repo.
- Every non-trivial change goes through a PR, not a direct push to `main` — a direct push doesn't
  count as reviewed. Qodo auto-reviews the PR; comment `/agentic_review` if it doesn't fire.
- Address High-severity findings before merging; dismiss anything else with a one-line reason in
  the PR thread.
- Before submission, add a "Qodo Code Review Evidence" section to the README with a merged PR
  link and 1-2 lines on what Qodo caught and how it was addressed.

## Commands

<!-- fill in once the repo has real scripts: dev, seed, smoke -->
- `npm run dev` — starts both, or document if backend/frontend run separately.
- `npm run seed` — writes the two seeded past incidents from CONTRACT.md.
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

When corrected, add the rule here rather than fixing the same thing twice.

## Lessons carried over from prior builds (main-session responsibilities)

- **Only one dev server, one port, at a time.**
- **Never let an agent `git stash`.** Commit first if a clean tree is needed.
- **A builder pushing to `review` is not verified.** Always dispatch the verifier.
- **Background agent reports can end mid-task.** Check `BOARD.tsv` for the actual verdict row.
- **Push only what's actually verified**, and only when nothing else has in-flight uncommitted
  changes in the same files.
