# Video script — Snitch (≤3:00 total)

Written as actual spoken narration — read it out loud, don't treat it as bullet points to
paraphrase. Tabs to have open before recording: `localhost:3000` (the app), the GitHub repo,
the PR with Qodo's review, TrueForge's dashboard (`localhost:8790`). Switch tabs, don't wait on
page loads.

## 1. About the project — the use case (0:00–0:30)

"Picture this: it's 3am, your phone goes off, checkout's throwing errors. You open your laptop
half-asleep and your first two questions are always the same — is this us, or is a vendor down?
And if it's us, what do I actually do about it? Most people spend the first ten minutes of an
incident just answering those two questions before they've fixed anything.

Snitch is an agent that answers them for you before you even open your laptop. It investigates
the alert — pulls the real logs, checks what actually got deployed, checks whether a dependency
or vendor is having an outage — and hands you a root cause with the receipts attached. Not a
paragraph you have to trust. The actual log line. The actual commit. And it will not touch
anything — no rollback, no restart — until you personally say yes."

## 2. Tech stack and architecture (0:30–1:05)

Switch to the GitHub repo tab briefly.

"Under the hood, this runs on TrueForge as the actual agent harness — three subagents
investigate in parallel: one reads logs, one reads the diff, one checks a live external source
through Bright Data. The approval gate you're about to see isn't something we coded ourselves to
look convincing — it's TrueForge's own native mechanism pausing a real tool call, and we
verified that independently against TrueForge's own session state, not just our app's word for
it. OpenAI does the actual reasoning over every real tool call. And Qodo reviewed this exact pull
request before it touched main — it caught a real security gap in how we enforced that approval,
and we fixed it before shipping."

## 3. Demo (1:05–2:40) — the bulk of the video

Switch to the app tab, already loaded.

"So here's the incident list. Real history on top, and right here" — point at the trigger box —
"is where you'd actually kick off an investigation. This is the exact scenario I described:
checkout API error rate spike." Hit **Trigger investigation**.

"Watch — it's investigating live, right now, over a real connection, not a canned animation."
Let the Timeline fill in. "Logs subagent just pulled the real error data. Diff subagent found the
actual commit that went out around the same time. And this one" — point at the external
tool_call — "is Bright Data, live, checking the real GitHub changelog for the dependency that
just got bumped, to see if the vendor's own release notes explain what broke."

Incident reaches `awaiting_approval`. "And here's the moment that matters. It's not asking me to
trust a conclusion — click into Evidence and Hypothesis" — do it — "every single claim here has
the actual excerpt it came from, right next to it. This one's marked unverified, because the
agent genuinely couldn't back it with evidence, and it says so instead of guessing. It also
looked at other options and told me the tradeoffs, instead of just handing me one answer to
rubber-stamp."

Click **Approve**. "And now it executes — for real — and resolves. That pause you just watched
wasn't decoration. I checked it against TrueForge's own internal state directly, independent of
our own app, and it's genuinely enforced at the harness level."

## 4. Learning and growth (2:40–2:55, cut first if short on time)

"The biggest thing I learned building this: making a harness *actually* do the work, instead of
just orchestrating it from our own code, is a real rewrite, not a small tweak — and a code review
pass caught a genuine security hole in that exact rewrite before it shipped. That's the whole
point of running one."

## 5. Close (2:55–3:00)

"Snitch — you get an answer with receipts, and nothing happens until you say so."

---

**Cut order if running long**: trim section 4 first, then tighten how long you linger on the
Evidence tab. Never cut the approval-click moment, the Bright Data callout, or the opening 3am
framing — that framing is what makes the pain point land, not just a feature list.
