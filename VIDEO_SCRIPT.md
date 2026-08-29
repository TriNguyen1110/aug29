# Video script — Snitch (≤3:00 total, slow delivery)

Real spoken narration, trimmed for a slow pace (~350 words total). Tabs open before recording:
the app, GitHub repo, the PR with Qodo's review, TrueForge's dashboard. Switch tabs, don't wait
on page loads.

## 1. About the project (0:00–0:20)

"It's 3am. Checkout's throwing errors. Your first question is always the same: is this us, or a
vendor down? Snitch answers that before you even open your laptop. It investigates the alert and
hands you a root cause — with the real log line, the real commit, attached. And it won't touch
anything until you say yes."

## 2. Tech stack and architecture (0:20–0:50)

Switch to the GitHub repo tab.

"It runs on TrueForge, the actual harness. Three subagents investigate in parallel — logs, diff,
and a live external check through Bright Data. The approval gate is TrueForge's own real
mechanism, not something we faked to look convincing — we verified that independently. OpenAI
does the reasoning. And Qodo reviewed this exact PR before it shipped — caught a real security
gap, which we fixed."

## 3. Demo (0:50–2:30)

Switch to the app.

"Here's the incident list. This box triggers a real investigation." Hit **Trigger
investigation**.

"It's investigating live." Let the Timeline fill in. "Logs found the real error. Diff found the
real commit. And this — Bright Data — is checking the vendor's real changelog live."

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
