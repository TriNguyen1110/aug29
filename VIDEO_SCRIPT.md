# Video script — Snitch (≤3:00 total)

Tabs to have open before recording: `localhost:3000` (the app), the GitHub repo
(`github.com/TriNguyen1110/aug29`), the PR with Qodo's review, TrueForge's dashboard
(`localhost:8790`). Don't navigate to any of these live on camera — switch tabs, don't wait on
page loads.

## 1. About the project (0:00–0:25)

"Snitch is an incident-response agent for the moment an alert fires. The real problem it solves:
investigate → hypothesize → ask a human before acting is already the industry-standard pattern —
funded competitors ship some version of it today. What none of them do is let you check the
agent's work. Every claim Snitch makes traces to a real, verbatim piece of evidence from an
actual tool call — logs, a code diff, or a live external check — not a paragraph you have to
trust blind."

## 2. Tech stack and architecture (0:25–1:00)

Switch to the GitHub repo tab briefly, point at the file tree / README.

"Built on TrueForge as the actual harness — not a thin wrapper. Three scoped subagents
investigate in parallel: logs, diff, and a live external-evidence check via Bright Data. The
approval gate is TrueForge's own native mechanism — a real gated MCP tool call that pauses the
harness itself, not code we wrote to fake a pause. OpenAI reasons over every real tool call.
Qodo reviewed this exact pull request before it reached main — [flash the PR tab] — found real
bugs, including a security gap in how the approval binding was enforced, and we fixed it."

## 3. Demo (1:00–2:40) — the bulk of the video

Switch to the app tab, already loaded.

- (1:00–1:15) "Here's the incident list — real seeded history, and a live trigger." Type the
  scenario, hit **Trigger investigation**.
- (1:15–1:50) Point at the Timeline tab filling in live over real SSE: "logs pulls a real error
  excerpt, diff finds the actual commit, and this — branded 'via Bright Data' — is a live scrape
  of the real dependency's GitHub changelog, checking whether the actual release notes explain
  the failure." Let it reach `awaiting_approval`.
- (1:50–2:25) Pending-approval banner, unmissable. Click into **Evidence & Hypothesis**: "every
  claim shows its literal excerpt inline — this one's flagged unverified because the agent
  couldn't back it, and it says so instead of guessing. Alternatives with real tradeoffs, not a
  rubber stamp." Click **Approve**. Resolved.
- (2:25–2:40) "That pause was real — TrueForge's own harness state, independently verified
  against its own session API, not just our app's word for it."

## 4. Learning and growth, if time remains (2:40–2:55)

"The biggest lesson: making the harness *actually* do the work — not just orchestrate it from our
own code — took a real rewrite, and paid off. A code-review pass caught a genuine security gap
in that rewrite before it shipped, which is exactly the point of running one."

## 5. Close (2:55–3:00)

"Snitch — evidence per claim, human approval that's real, not simulated."

---

**Cut order if running long**: trim section 4 first (it's marked optional), then tighten the
demo's evidence-tab dwell time — never cut the approval-click moment or the Bright Data callout,
those two are the whole pitch.
