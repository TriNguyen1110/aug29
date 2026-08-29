// Verifier-owned. DATA-scope standing tests for backend flows that have reached `review`/`done`
// on BOARD.tsv. Run against the already-running dev server (npm run dev, port 3000) —
// this file never starts its own server. Run with: node --test tests/backend.flows.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const INCIDENT_EVENT_TYPES = new Set([
  "subagent_start",
  "tool_call",
  "subagent_result",
  "scrape_issue",
  "scrape_repaired",
  "clarification_requested",
  "clarification_provided",
  "hypothesis",
  "approval_requested",
  "approval_granted",
  "approval_denied",
  "action_executed",
  "summary_posted",
]);

const INCIDENT_STATUSES = new Set([
  "investigating",
  "awaiting_approval",
  "remediating",
  "resolved",
]);

function assertIncidentShape(incident) {
  assert.equal(typeof incident.id, "string");
  assert.equal(typeof incident.title, "string");
  assert.ok(INCIDENT_STATUSES.has(incident.status), `unexpected status ${incident.status}`);
  assert.equal(typeof incident.createdAt, "string");
  assert.ok(!Number.isNaN(Date.parse(incident.createdAt)), "createdAt must be a parseable ISO date");
}

function assertEventShape(event) {
  assert.equal(typeof event.id, "string");
  assert.equal(typeof event.incidentId, "string");
  assert.equal(typeof event.ts, "string");
  assert.ok(!Number.isNaN(Date.parse(event.ts)), "event.ts must be a parseable ISO date");
  assert.ok(INCIDENT_EVENT_TYPES.has(event.type), `unexpected event type ${event.type}`);
  assert.equal(typeof event.payload, "object");
}

// Item 01 (DATA): GET /api/incidents returns a real, non-empty, most-recent-first seeded list.
test("GET /api/incidents returns seeded list, most-recent-first, matching Incident shape", async () => {
  const res = await fetch(`${BASE_URL}/api/incidents`);
  assert.equal(res.status, 200);
  const incidents = await res.json();

  assert.ok(Array.isArray(incidents));
  assert.ok(incidents.length >= 2, "seed data must produce at least 2 incidents (item 20: Case 1/2)");

  for (const incident of incidents) assertIncidentShape(incident);

  const byId = Object.fromEntries(incidents.map((i) => [i.id, i]));
  assert.ok(byId.inc_auth500, "seeded incident inc_auth500 must be present");
  assert.ok(byId.inc_imgupload, "seeded incident inc_imgupload must be present");

  // Item 20: seeded titles use the "Case N: <description>" format for demo narration.
  assert.match(byId.inc_auth500.title, /^Case 1: /, "inc_auth500 title must be Case 1: ...");
  assert.match(byId.inc_imgupload.title, /^Case 2: /, "inc_imgupload title must be Case 2: ...");

  for (let i = 1; i < incidents.length; i++) {
    const prev = Date.parse(incidents[i - 1].createdAt);
    const cur = Date.parse(incidents[i].createdAt);
    assert.ok(prev >= cur, "incidents must be sorted most-recent-first by createdAt");
  }
});

// Item 01 (DATA): GET /api/incidents/:id returns { incident, events } with full event history,
// shape matching backend's fact rows (route-shape, seed-ids) on BOARD.tsv.
test("GET /api/incidents/inc_auth500 returns { incident, events } with 16 events", async () => {
  const res = await fetch(`${BASE_URL}/api/incidents/inc_auth500`);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.deepEqual(Object.keys(body).sort(), ["events", "incident"]);
  assertIncidentShape(body.incident);
  assert.equal(body.incident.id, "inc_auth500");
  assert.equal(body.incident.status, "resolved");

  assert.ok(Array.isArray(body.events));
  assert.equal(body.events.length, 16, "fact row claims inc_auth500 has 16 events");
  for (const event of body.events) {
    assertEventShape(event);
    assert.equal(event.incidentId, "inc_auth500");
  }
});

test("GET /api/incidents/inc_imgupload returns { incident, events } with 16 events incl. clarification round-trip", async () => {
  const res = await fetch(`${BASE_URL}/api/incidents/inc_imgupload`);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.deepEqual(Object.keys(body).sort(), ["events", "incident"]);
  assertIncidentShape(body.incident);
  assert.equal(body.incident.id, "inc_imgupload");
  assert.equal(body.incident.status, "resolved");

  assert.ok(Array.isArray(body.events));
  assert.equal(body.events.length, 16, "fact row claims inc_imgupload has 16 events");

  const types = body.events.map((e) => e.type);
  assert.ok(types.includes("clarification_requested"), "must include clarification_requested per fact row");
  assert.ok(types.includes("clarification_provided"), "must include clarification_provided per fact row");

  for (const event of body.events) {
    assertEventShape(event);
    assert.equal(event.incidentId, "inc_imgupload");
  }
});


test("GET /api/incidents/:id 404s with an error body for an unknown id", async () => {
  const res = await fetch(`${BASE_URL}/api/incidents/does-not-exist`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(typeof body.error, "string");
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

// Item 03 (DATA): a real, live trigger -> approval-gate -> execute integration flow against the
// running dev server, no mocks. Confirms (a) the trigger endpoint actually starts a run, (b) the
// approval gate genuinely blocks (action_executed does not appear until the approval POST lands,
// verified via event-log ORDER not just a status field), and (c) every Evidence.excerpt on the
// resulting claims is a real, verbatim substring of the fixed simulated tool output the harness
// is grounded against (lib/simTools.ts), per CONTRACT.md's core grounding rule.
test("POST /api/incidents/trigger starts a real run that blocks on approval, then executes only the approved spec, with grounded evidence", async () => {
  const trigger = await fetch(`${BASE_URL}/api/incidents/trigger`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario: "Checkout API error rate spike" }),
  });
  assert.equal(trigger.status, 200, "trigger endpoint should 200");
  const { incidentId } = await trigger.json();
  assert.ok(incidentId, "trigger should hand back a real incidentId");

  // Confirm the run actually started doing work, not just returning an id into the void.
  await pollUntil(incidentId, (d) => d.events.some((e) => e.type === "subagent_start"), { timeoutMs: 20000 });

  // Wait for the gate. Confirm status via GET *before* posting anything.
  // Item 11 (native TrueForge gated-tool approval) adds two real extra TrueForge
  // session/turn round-trips beyond the three subagents + synthesis. On top of that, a
  // live isolated timing check (bdata scraper run against the same github_status
  // collector, no concurrency) measured ~80s for a single scrape just now — Bright Data's
  // live latency varies a lot run to run (BOARD.tsv item 09's H+2.12 already documented
  // 7s-33s variance for one target; today it's worse). 150s covers a real slow scrape plus
  // everything else in the pipeline without ever faking speed we don't have.
  const atGate = await pollUntil(incidentId, (d) => d.incident.status === "awaiting_approval", { timeoutMs: 150000 });
  assert.equal(atGate.incident.status, "awaiting_approval");
  assert.ok(
    !atGate.events.some((e) => e.type === "action_executed"),
    "action_executed must not exist before the approval decision is posted",
  );

  const approvalEvent = atGate.events.find((e) => e.type === "approval_requested");
  assert.ok(approvalEvent, "must have a real approval_requested event");
  const { approvalId, claims, alternatives, actionSpec } = approvalEvent.payload;
  assert.ok(approvalId, "approval_requested must carry a real approvalId");

  // Rule 4: alternatives with tradeoffs, not a flat single suggestion.
  assert.ok(Array.isArray(alternatives) && alternatives.length > 0, "approval_requested must carry >=1 alternative");
  for (const alt of alternatives) {
    assert.ok(typeof alt.description === "string" && alt.description.length > 0);
    assert.ok(typeof alt.tradeoff === "string" && alt.tradeoff.length > 0);
  }

  // The core grounding rule: every non-empty Evidence.excerpt on every claim must be a literal
  // substring of the real tool output it claims to come from. logs/diff tool output is fixed
  // (lib/simTools.ts); external tool output is real, live Bright Data scrape content (item 06)
  // and therefore NOT a fixed string worth hardcoding here — instead ground against this run's
  // own real tool_call outputs, captured live, same rigor either way. Anything that failed this
  // check in code should already have been dropped to evidence: [] before reaching here.
  const realToolOutputs = atGate.events
    .filter((e) => e.type === "tool_call")
    .map((e) => String(e.payload.output ?? ""));
  assert.ok(realToolOutputs.length > 0, "must have real tool_call output to ground evidence against");

  assert.ok(Array.isArray(claims) && claims.length > 0);
  let sawAnyEvidence = false;
  for (const claim of claims) {
    for (const ev of claim.evidence) {
      sawAnyEvidence = true;
      assert.ok(ev.source && ev.ref && typeof ev.excerpt === "string" && ev.excerpt.length > 0);
      assert.ok(
        realToolOutputs.some((src) => src.includes(ev.excerpt)),
        `evidence excerpt is not a verbatim substring of this run's real tool_call output: ${JSON.stringify(ev)}`,
      );
    }
  }
  assert.ok(sawAnyEvidence, "at least one claim must carry real grounded evidence to reach approval at all");

  // Now resolve the gate for real, over HTTP, same as a human clicking Approve.
  const approveRes = await fetch(`${BASE_URL}/api/incidents/${incidentId}/approvals/${approvalId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
  assert.equal(approveRes.status, 200);

  const resolved = await pollUntil(incidentId, (d) => d.incident.status === "resolved", { timeoutMs: 20000 });

  // Verify blocking via event-log ORDER, not just the final status field: approval_requested
  // must come strictly before approval_granted, which must come strictly before action_executed.
  const idx = (type) => resolved.events.findIndex((e) => e.type === type);
  const iRequested = idx("approval_requested");
  const iGranted = idx("approval_granted");
  const iExecuted = idx("action_executed");
  assert.ok(iRequested >= 0 && iGranted >= 0 && iExecuted >= 0, "full gate sequence must be present in the log");
  assert.ok(iRequested < iGranted, "approval_requested must precede approval_granted in the event log");
  assert.ok(iGranted < iExecuted, "approval_granted must precede action_executed in the event log");

  // Rule 2: execution runs the exact approved actionSpec, never a re-derived one.
  const executedEvent = resolved.events[iExecuted];
  assert.deepEqual(
    executedEvent.payload.actionSpec,
    actionSpec,
    "executor must run the actionSpec verbatim as approved on the Approval record",
  );
});

// Item 06 (DATA): the Bright Data target swap off KYC-blocked Stripe status/changelog. Confirms
// (a) data/targets.json config itself no longer names the blocked Stripe targets and instead has
// the two new ones (github_status, stripe_node_releases pointed at the .atom feed, not the plain
// HTML releases page which fell into Bright Data's slow batch-mode fallback per BOARD.tsv fact
// row H+1.55), and (b) a real live-triggered run's `external` subagent tool_call events actually
// reference those new Collector IDs and URLs — not a config file nobody reads at runtime.
test("data/targets.json + a live run use the new non-Stripe Bright Data targets, not the old KYC-blocked ones", async () => {
  const targets = JSON.parse(readFileSync(join(__dirname, "..", "data", "targets.json"), "utf8"));
  assert.ok(Array.isArray(targets) && targets.length === 2, "expect exactly the 2 new targets");

  const byName = Object.fromEntries(targets.map((t) => [t.name, t]));
  assert.ok(byName.github_status, "github_status target must exist");
  assert.ok(byName.stripe_node_releases, "stripe_node_releases target must exist");

  // Old, KYC-blocked targets must be gone.
  const urls = targets.map((t) => t.url);
  assert.ok(!urls.some((u) => u.includes("status.stripe.com")), "old status.stripe.com target must be removed");
  assert.ok(!urls.some((u) => u.includes("docs.stripe.com")), "old docs.stripe.com changelog target must be removed");

  // stripe_node_releases must point at the stripe-node releases page and use the new
  // item-09 collector (c_mteuv35a2e1t4fqzsc), not the old KYC-blocked Stripe targets or the
  // item-06 atom-feed collector (metadata-only). This collector is explicitly scoped to the
  // first page / latest ~10 releases only (no pagination), so the plain (non-.atom) URL is
  // now correct — asserting ".atom" here is stale post item-09 (BOARD.tsv H+2.0 fact row).
  assert.equal(
    byName.stripe_node_releases.collectorId,
    "c_mteuv35a2e1t4fqzsc",
    `stripe_node_releases must use item 09's fast+rich first-page collector, got ${byName.stripe_node_releases.collectorId}`,
  );
  assert.ok(
    byName.stripe_node_releases.url.includes("github.com/stripe/stripe-node/releases"),
    "stripe_node_releases must be the stripe-node releases feed",
  );
  assert.ok(byName.github_status.url.includes("githubstatus.com"), "github_status must target githubstatus.com");
  for (const t of targets) {
    assert.equal(typeof t.collectorId, "string");
    assert.ok(t.collectorId.startsWith("c_"), `collectorId must be a real Bright Data collector id, got ${t.collectorId}`);
  }

  // Now prove it's not just config that nobody reads: trigger a real run and confirm the
  // external subagent's real tool_call events cite these exact collector ids + urls.
  const trigger = await fetch(`${BASE_URL}/api/incidents/trigger`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario: "Checkout API error rate spike" }),
  });
  assert.equal(trigger.status, 200);
  const { incidentId } = await trigger.json();

  // The external subagent runs after logs+diff; give it room but bound it, same budget as
  // the other live-trigger test above (see its comment re: real, observed Bright Data
  // latency variance — two sequential live scrapes can legitimately take well over 45s).
  const atGateOrDone = await pollUntil(
    incidentId,
    (d) => ["awaiting_approval", "resolved"].includes(d.incident.status) ||
      d.events.some((e) => e.type === "scrape_issue" && e.payload.agent !== undefined) ||
      d.events.filter((e) => e.type === "tool_call" && e.payload.agent === "external").length >= 2,
    { timeoutMs: 150000 },
  );

  const externalToolCalls = atGateOrDone.events.filter((e) => e.type === "tool_call" && e.payload.agent === "external");
  const externalScrapeIssues = atGateOrDone.events.filter((e) => e.type === "scrape_issue");

  assert.ok(
    externalToolCalls.length > 0 || externalScrapeIssues.length > 0,
    "external subagent must have attempted at least one real Bright Data scrape (tool_call) or honestly reported scrape_issue",
  );

  const knownCollectorIds = targets.map((t) => t.collectorId);
  const knownUrls = targets.map((t) => t.url);
  const oldStripeCollectorIds = ["c_mterqfcf11gtnha5a", "c_mterrg4ec3sh7fph7"]; // superseded per BOARD.tsv H+1.55/H+0.77

  for (const call of externalToolCalls) {
    const input = String(call.payload.input ?? "");
    assert.ok(
      knownCollectorIds.some((id) => input.includes(id)) && knownUrls.some((u) => input.includes(u)),
      `external tool_call input must reference one of the new collector ids/urls, got: ${input}`,
    );
    for (const oldId of oldStripeCollectorIds) {
      assert.ok(!input.includes(oldId), `external tool_call must not reference the old KYC-blocked collector ${oldId}`);
    }
    assert.ok(!input.includes("status.stripe.com"), "external tool_call must not scrape the old KYC-blocked status.stripe.com");
    assert.ok(!input.includes("docs.stripe.com"), "external tool_call must not scrape the old KYC-blocked docs.stripe.com");
  }

  for (const issue of externalScrapeIssues) {
    const targetUrl = String(issue.payload.targetUrl ?? "");
    if (targetUrl) {
      assert.ok(knownUrls.includes(targetUrl), `scrape_issue targetUrl must be one of the new targets, got: ${targetUrl}`);
    }
  }
});
