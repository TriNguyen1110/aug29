// Verifier-owned. DATA-scope standing tests for backend flows that have reached `review`/`done`
// on BOARD.tsv. Run against the already-running dev server (npm run dev, port 3000) —
// this file never starts its own server. Run with: node --test tests/backend.flows.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

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
  assert.ok(incidents.length >= 2, "seed data must produce at least 2 incidents");

  for (const incident of incidents) assertIncidentShape(incident);

  const ids = incidents.map((i) => i.id);
  assert.ok(ids.includes("inc_auth500"), "seeded incident inc_auth500 must be present");
  assert.ok(ids.includes("inc_imgupload"), "seeded incident inc_imgupload must be present");

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
  const LOG_QUERY_OUTPUT =
    "14:58:00-15:04:00 checkout-service p95_latency=180ms error_rate=0.3% (baseline).\n" +
    "15:04:10 checkout-service ERROR rate step-changes to 38% (baseline 0.3%).\n" +
    "15:04:12 checkout-service ERROR 847 requests failed with 502: StripeConnectionError: " +
    "\"Request failed: socket hang up\" at PaymentIntentClient.confirm (payment_intent_client.ts:112)\n" +
    "15:04:12 checkout-service ERROR retry_exhausted=true retries=3 backoff_ms=[200,400,800]\n" +
    "15:09:00 checkout-service ERROR rate holding steady at 37-39%, all failures the same " +
    "StripeConnectionError at PaymentIntentClient.confirm.";
  const GIT_LOG_OUTPUT =
    "d4e5f6a 2026-08-29T15:02:47Z deploy-bot \"Bump stripe-node 14.8.0 -> 17.0.0, switch " +
    "PaymentIntentClient.confirm to the new idempotent-retry helper\"";
  const GIT_SHOW_OUTPUT =
    "- const stripe = new Stripe(key, { apiVersion: '2023-10-16', timeout: 20000, maxNetworkRetries: 3 });\n" +
    "+ const stripe = new Stripe(key, { apiVersion: '2023-10-16', timeout: 3000, maxNetworkRetries: 3 });\n" +
    "  // stripe-node 17 default socket timeout is shorter; not re-tuned after the bump";
  const GROUNDABLE_SOURCES = [LOG_QUERY_OUTPUT, GIT_LOG_OUTPUT + "\n" + GIT_SHOW_OUTPUT];

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
  const atGate = await pollUntil(incidentId, (d) => d.incident.status === "awaiting_approval", { timeoutMs: 45000 });
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
  // substring of the real simulated tool output it claims to come from. Anything that failed
  // this check in code should already have been dropped to evidence: [] before reaching here.
  assert.ok(Array.isArray(claims) && claims.length > 0);
  let sawAnyEvidence = false;
  for (const claim of claims) {
    for (const ev of claim.evidence) {
      sawAnyEvidence = true;
      assert.ok(ev.source && ev.ref && typeof ev.excerpt === "string" && ev.excerpt.length > 0);
      assert.ok(
        GROUNDABLE_SOURCES.some((src) => src.includes(ev.excerpt)),
        `evidence excerpt is not a verbatim substring of real tool output: ${JSON.stringify(ev)}`,
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
