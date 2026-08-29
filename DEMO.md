# Demo script — Snitch

~4 minutes. Two branches depending on whether Bright Data's KYC is cleared by demo time — both
are real outcomes, don't fake either one.

## 1. The hook (20s)

"When a checkout API starts throwing errors, the first question every on-call engineer asks is
'is this us, or is our payment provider down?' Most incident-response agents today already do
investigate → hypothesize → ask a human before acting — that part's table stakes. What none of
them do is let you check their work. This one does."

## 2. Trigger it live (30s)

On the incident list: type a real scenario ("Checkout API error rate spike") into the trigger
input, hit run. New incident appears, timeline starts filling in live over SSE — point at the
stack strip in the header: **TrueForge** is running three real subagents right now, backed by
**OpenAI**.

## 3. Watch the investigation (60s)

Narrate the timeline as it streams:
- `logs` subagent pulls real error-rate data — point at the actual excerpt, not a summary.
- `diff` subagent checks recent deploys/commits.
- `external` subagent — this is **Bright Data**, live-scraping Stripe's real status page and
  changelog. Point at the Collector ID and URL rendered inline.

**Branch A — KYC cleared, live Stripe data returned:** if Stripe shows a real incident, that
becomes the evidence-backed root cause on screen. "The agent didn't guess — it found this."
**Branch B — still KYC-blocked:** the external subagent honestly reports a blocked scrape, not
fabricated content. "This is Bright Data attempting a real scrape against a real account — right
now it's blocked pending KYC, and the agent says so instead of making something up. That
honesty is the same principle as the evidence-per-claim pitch: never assert what you can't back."
Either branch is a legitimate demo beat — don't apologize for Branch B, it proves the
no-fabrication rule is real, not just a slide.

## 4. The centerpiece — the approval screen (60s)

Incident reaches `awaiting_approval`. This is the screen to slow down on:
- Every claim shows its evidence inline — source, ref, the literal excerpt. "Check the agent's
  work yourself, right here, instead of trusting a paragraph."
- Point at an unbacked claim if one exists — the visibly distinct "unverified, inferred only" tag.
- Alternatives with tradeoffs are shown next to the recommendation, not hidden behind a click —
  "it's not a rubber stamp, it actually considered options."
- Approve it. Action executes in the sandbox, summary posts.

## 5. The honesty path, if time allows (30s)

Trigger a second scenario worded ambiguously enough to starve the subagents of strong evidence —
watch it emit `clarification_requested` instead of forcing a low-confidence guess. "It asks
instead of assuming when it doesn't actually know."

## 6. Close — the sponsors, explicitly (30s)

"To recap what's actually running this, not just sponsor logos on a slide:
- **TrueForge** is the harness itself — the three real subagents, the approval gate that
  genuinely blocks execution, the session you just watched survive that whole run.
- **OpenAI** reasons over every real tool call — nothing here is templated text.
- **Bright Data** is the external-evidence subagent, live-scraping Stripe for real, and reporting
  honestly when it can't.
- **Qodo** reviewed the pull request this shipped in before it ever reached `main` — check the
  README for the evidence link."

## Fallback reminders (see CONTRACT.md's fallback table for the full list)

- Bright Data unreachable entirely (not just KYC): replay the last cached response from
  `./data/raw/`, label it clearly as replayed.
- TrueForge subagent call flaking on stage: CONTRACT.md's sequential-real-calls fallback, same
  event shapes — never a canned string standing in for a real one.
- Never cut: the approval gate, the live timeline, evidence-per-claim. Those three are the whole
  demo.
