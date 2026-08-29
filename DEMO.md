# Demo script — Snitch

~4 minutes. Updated for the current build: Bright Data targets are now GitHub/stripe-node (not
Stripe's KYC-blocked pages), the detail page is split into Timeline / Evidence & Hypothesis tabs,
and there's a real trigger UI (no curl needed). Two branches still possible depending on live
scrape outcome — don't fake either one.

## 1. The hook (20s)

"When a checkout API starts throwing errors, the first question every on-call engineer asks is
'is this us, or something we just shipped?' Most incident-response agents today already do
investigate → hypothesize → ask a human before acting — that part's table stakes. What none of
them do is let you check their work. This one does."

## 2. Trigger it live (30s)

On the incident list: point at the 3 value-prop chips and the one-line pitch first ("evidence
per claim," "human approves, always"), then type a scenario into the real **Trigger a live
investigation** input (defaults to "Checkout API error rate spike") and hit **Trigger
investigation**. New incident appears, timeline starts filling in live over a real SSE
connection — point at the sponsor strip in the footer: **TrueForge** is running the investigation
right now, backed by **OpenAI**.

Note the **Seeded example** vs **Live-triggered** badge on every incident — makes clear which
rows are fixed history and which one you just triggered live.

## 3. Watch the investigation — Timeline tab (60s)

The detail page opens on the **Timeline** tab by default. Narrate as real events stream in:
- `logs` subagent pulls real error-rate data — the row expands to the actual log excerpt, not a
  one-line summary.
- `diff` subagent checks the recent deploy/commit that likely caused it.
- `external` subagent — this is **Bright Data**, branded inline as "via Bright Data" with the
  real Collector ID and URL. It checks the real `stripe-node` GitHub changelog for what changed
  in the dependency bump the diff subagent just found, plus GitHub's status page as a general
  vendor-outage signal.

**If the live scrape returns real changelog content** (the common case now — a fast, page-limited
collector, not the old slow full-history crawl): the hypothesis can cite a real, specific line
from the dependency's actual release notes. **If a scrape genuinely fails** (rate limit, a
structure change): it renders as a distinct "Bright Data scrape blocked — `<cause>`" card, and the
hypothesis honestly says external evidence was inconclusive rather than inventing a cause. Either
outcome is a legitimate beat — the second one proves the no-fabrication rule is real, not a slide.

## 4. The centerpiece — Evidence & Hypothesis tab + the approval gate (60s)

The pending-approval banner and the approval card stay pinned above both tabs the whole time —
point out that it's impossible to miss regardless of which tab you're on. Click into the
**Evidence & Hypothesis** tab to slow down on:
- Every claim shows its evidence inline — source, ref, the literal excerpt. "Check the agent's
  work yourself, right here, instead of trusting a paragraph."
- Point at an unbacked claim if one exists — the visibly distinct "unverified, inferred only" tag.
- Alternatives with tradeoffs are shown next to the recommendation, not hidden behind a click —
  "it's not a rubber stamp, it actually considered options."
- Approve it. Action executes, summary posts, incident resolves.

## 5. The honesty path, if time allows (30s)

Trigger a second scenario worded ambiguously enough to starve the subagents of strong evidence —
watch it emit `clarification_requested` instead of forcing a low-confidence guess. "It asks
instead of assuming when it doesn't actually know."

## 6. Close — the sponsors, explicitly (30s)

"To recap what's actually running this, not just sponsor logos on a slide:
- **TrueForge** is the harness itself — the real subagent investigation, the approval gate, the
  session you just watched survive that whole run.
- **OpenAI** reasons over every real tool call — nothing here is templated text.
- **Bright Data** is the external-evidence subagent, live-scraping real GitHub/stripe-node pages,
  and reporting honestly when a scrape fails instead of faking content.
- **Qodo** reviewed the pull request this shipped in before it ever reached `main` — real bugs
  found and fixed, see the README's Qodo Code Review Evidence section for specifics."

## Known honest limitation, say it plainly if asked

The trigger's scenario text is currently display-only — every live-triggered run investigates the
same seeded checkout/Stripe-dependency scenario regardless of what's typed. If asked "what happens
if I type something else," say so directly rather than dodging: "the trigger UI takes real input,
but today only this one scenario is actually wired end to end — that's the honest state, not
something to hide."

## Fallback reminders (see CONTRACT.md's fallback table for the full list)

- Bright Data unreachable entirely: replay the last cached response from `./data/raw/`
  (`stripe_node_releases.cached-fallback.json` has 711 real records), label it clearly as replayed.
- TrueForge subagent call flaking on stage: CONTRACT.md's sequential-real-calls fallback, same
  event shapes — never a canned string standing in for a real one.
- Never cut: the approval gate, the live timeline, evidence-per-claim. Those three are the whole
  demo.
