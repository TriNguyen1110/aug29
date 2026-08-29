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
