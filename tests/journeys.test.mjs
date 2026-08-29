// Verifier-owned. Journey-style tests: model what an actual on-call engineer does with this
// tool end to end, not a synthetic click-sequence assembled just to make an assertion pass
// (see CLAUDE.md "Verifier journey tests must be realistic, not toy"). Run against the
// already-running dev server (npm run dev, port 3000) — this file never starts its own server,
// and never kills/restarts the harness run in flight. Run with:
//   node --test tests/journeys.test.mjs
//
// Uses a headless Playwright browser (devDependency, not persisted to package.json, same as
// tests/frontend.flows.test.mjs) for the reading/clicking half of the journey, and plain fetch
// for the backend half (triggering a run, polling its state) — an on-call engineer doesn't care
// which layer produced the state, they care whether the screen tells the truth about it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
});

async function getIncident(id) {
  const res = await fetch(`${BASE_URL}/api/incidents/${id}`);
  assert.equal(res.status, 200, `GET /api/incidents/${id} should 200`);
  return res.json();
}

async function pollUntil(id, predicate, { timeoutMs = 45000, intervalMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await getIncident(id);
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `pollUntil timed out after ${timeoutMs}ms for incident ${id}, last status=${last?.incident?.status}, events=${last?.events?.length}`,
  );
}

// A real on-call engineer's first question on a checkout-error-spike page: is this us, or is
// the payment provider down? Trigger the live "Checkout API error rate spike" scenario (the one
// CONTRACT.md wires the Bright Data external subagent against), wait for it to reach a decision
// point, read the evidence the way a reviewer actually would (root cause -> claims -> the literal
// tool-output backing each one -> alternatives with tradeoffs), then make the same approve/deny
// call a human would, and confirm the system actually recorded it rather than just repainting
// the button.
test("on-call journey: trigger checkout_error_spike, read the evidence-backed hypothesis through to an approval decision", async () => {
  const trigger = await fetch(`${BASE_URL}/api/incidents/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario: "checkout_error_spike" }),
  });
  assert.equal(trigger.status, 200, "trigger endpoint should 200");
  const { incidentId } = await trigger.json();
  assert.ok(incidentId, "trigger should hand back an incidentId");

  // A reviewer doesn't sit on a blank screen — the harness event log is what tells them
  // the investigation is progressing at all.
  const investigating = await pollUntil(
    incidentId,
    (d) => d.events.length > 0,
    { timeoutMs: 20000 },
  );
  assert.ok(
    investigating.events.some((e) => e.type === "subagent_start"),
    "should see at least one subagent kick off before any decision point",
  );

  // Wait for the run to actually reach the point a human is asked to decide something —
  // this is the moment the reviewer's tab would actually be opened on stage.
  const atGate = await pollUntil(
    incidentId,
    (d) => d.incident.status === "awaiting_approval",
    { timeoutMs: 45000 },
  );

  const approvalEvent = atGate.events.find((e) => e.type === "approval_requested");
  assert.ok(approvalEvent, "awaiting_approval status must have a real approval_requested event behind it");
  const { approvalId, claims, alternatives, actionSpec, action } = approvalEvent.payload;
  assert.ok(approvalId && action && actionSpec, "approval_requested payload must be complete, not a stub");

  // Rule from CONTRACT.md: every claim either has real evidence, or explicitly says it
  // doesn't. A reviewer checking their own work would look at exactly this.
  assert.ok(Array.isArray(claims) && claims.length > 0, "an approval reviewers see must carry claims");
  for (const claim of claims) {
    assert.ok(typeof claim.text === "string" && claim.text.length > 0);
    if (claim.evidence.length > 0) {
      for (const ev of claim.evidence) {
        assert.ok(ev.source && ev.ref && ev.excerpt, "backed evidence must have source+ref+excerpt, not a paraphrase");
      }
    }
  }
  // Rule from CONTRACT.md rule 4: an approval without alternatives is a smell, not neutral.
  assert.ok(Array.isArray(alternatives), "alternatives must be present (even if empty) on approval_requested");

  // Now read it the way a human actually would: open the incident page and look at the
  // real rendered screen, not just the API payload.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(`${BASE_URL}/incidents/${incidentId}`, { waitUntil: "networkidle", timeout: 15000 });

  // The pending-approval state has to be unmissable — a reviewer skimming shouldn't be able
  // to scroll past it without noticing there's a decision waiting on them.
  const bannerText = await page.locator("text=awaiting your decision").first().innerText();
  assert.match(bannerText, /approval/i);

  // RECOMMENDED ACTION / ALTERNATIVES CONSIDERED live on the always-visible ApprovalCard
  // (item 04/05: never hidden behind a tab). ROOT CAUSE lives on HypothesisCard inside the
  // "Evidence & Hypothesis" tab (item 05's tab split) — click it before asserting.
  const bodyTextBeforeTab = await page.evaluate(() => document.body.innerText);
  assert.match(bodyTextBeforeTab, /RECOMMENDED ACTION/);
  // item 08 trimmed "alternatives considered (N)" -> "alternatives (N)".
  assert.match(bodyTextBeforeTab, /ALTERNATIVES \(\d+\)/);
  await page.click('text="Evidence & Hypothesis"');
  const bodyText = await page.evaluate(() => document.body.innerText);
  assert.match(bodyText, /ROOT CAUSE/);
  // Every claim the API said was unbacked must be visibly flagged as such on screen, not
  // silently dropped or styled the same as a backed one — the entire pitch per CONTRACT.md.
  const hasUnbackedClaim = claims.some((c) => c.evidence.length === 0);
  if (hasUnbackedClaim) {
    assert.match(bodyText, /UNVERIFIED — INFERRED ONLY/);
  }

  // The reviewer makes the call: approve the recommended action, same as clicking the real
  // button on stage. `#approval-<id>` anchors only the card's header row (it's the scroll
  // target for "jump to approval"), not the whole card, so scope by the visible "Approve"
  // button itself — there's exactly one pending approval on this page at this point.
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.waitForTimeout(500);
  const afterClickText = await page.evaluate(() => document.body.innerText);
  assert.match(afterClickText, /resolved: approved/);
  await page.close();

  assert.deepEqual(consoleErrors, [], "reading the evidence + deciding must not throw in the console");

  // Confirm the decision actually landed server-side, not just in local component state —
  // and that the executor ran the *exact* stored actionSpec (CONTRACT.md rule 2), not a
  // re-derived one.
  const resolved = await pollUntil(
    incidentId,
    (d) => d.incident.status === "resolved",
    { timeoutMs: 20000 },
  );
  const granted = resolved.events.find(
    (e) => e.type === "approval_granted" && e.payload.approvalId === approvalId,
  );
  assert.ok(granted, "approval_granted event for this exact approvalId must be persisted");
  const executed = resolved.events.find((e) => e.type === "action_executed");
  assert.ok(executed, "action_executed must follow a granted approval");
  assert.deepEqual(
    executed.payload.actionSpec,
    actionSpec,
    "executor must run the actionSpec verbatim as approved, never a re-derived one",
  );
});
