# Video script — Snitch (≤3:00 total, slow delivery)

Real spoken narration, trimmed for a slow pace (~350 words total). Tabs open before recording:
the app, GitHub repo, the PR with Qodo's review, TrueForge's dashboard. Switch tabs, don't wait
on page loads.

## 1. About the project (0:00–0:25)

"It's 3am. Checkout's throwing errors. This is for the on-call engineer holding the phone —
whatever pages you already, pages this too. It checks three things, every time: the real logs,
the real code that changed, and — live — whether a vendor is actually down. A dashboard just
hands you that data and you connect the dots. Snitch connects them for you, and hands you one
claim to approve or deny — not a wall of logs to read at 3am."

## 2. Tech stack and architecture (0:20–0:50)

Switch to the GitHub repo tab.

"It runs on TrueForge, the real harness — three subagents in parallel, and an approval gate
that's TrueForge's own mechanism, verified independently, not something we faked. OpenAI does
the reasoning. Qodo reviewed this exact PR before it shipped, and caught a real security gap,
which we fixed."

## 3. Demo (0:50–2:30)

Switch to the app.

"Here's the incident list. This box triggers a real investigation." Hit **Trigger
investigation**.

"It's investigating live." Let the Timeline fill in. "Logs and diff run on demo fixtures today —
there's no real production system behind this build — but the agent's reasoning over them is
real, not scripted. What's genuinely live is this: Bright Data, right now, turning 'is it them
or us' into a checked fact instead of a guess."

Reaches `awaiting_approval`. Click into **Evidence and Hypothesis**. "Every claim has its actual
evidence right next to it. This one's marked unverified — it couldn't back it, so it says so
instead of guessing. It also shows other options, with tradeoffs."

Click **Approve**. "It executes, for real, and resolves. That pause was genuine — I checked it
against TrueForge's own state directly."

## 4. Learning and growth (2:30–2:45, cut first if short)

"The big lesson: making the harness actually do the work, not just orchestrate it, was a real
rewrite — and a code review caught a real security hole in it before launch."

## 5. Close (2:45–3:00)

"Snitch. An answer with receipts. Nothing happens until you say so."

---

**Cut order**: section 4 first, then trim the Evidence-tab pause. Never cut the approval click,
the Bright Data line, or the opening 3am line.
