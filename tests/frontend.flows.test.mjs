// Verifier-owned. SCREEN-scope standing tests for frontend flows that have reached
// `review`/`done` on BOARD.tsv. Run against the already-running dev server (npm run dev,
// port 3000) — this file never starts its own server. Run with:
//   node --test tests/frontend.flows.test.mjs
//
// Uses a headless Playwright browser (devDependency, not persisted to package.json) to
// render the actual pages and assert on real DOM content + absence of console/page errors,
// not just HTTP status — a route can 200 and still render an error boundary or empty state.

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

async function visit(path, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("response", (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
  });
  const response = await page.goto(`${BASE_URL}${path}`, {
    waitUntil: "networkidle",
    timeout: 15000,
  });
  const bodyText = await page.evaluate(() => document.body.innerText);
  return { page, response, consoleErrors, pageErrors, failedRequests, bodyText };
}

test("incident list (/) renders real seeded incidents, no errors, desktop", async () => {
  const { page, response, consoleErrors, pageErrors, failedRequests, bodyText } =
    await visit("/");
  assert.equal(response.status(), 200);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.match(bodyText, /Auth service 500 spike after deploy/);
  assert.match(bodyText, /Image upload latency regression/);
  assert.match(bodyText, /inc_auth500/);
  assert.match(bodyText, /inc_imgupload/);
  await page.close();
});

test("incident list (/) renders on a narrow/mobile viewport with no errors", async () => {
  const { page, response, consoleErrors, pageErrors, failedRequests, bodyText } = await visit(
    "/",
    { width: 390, height: 844 },
  );
  assert.equal(response.status(), 200);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.match(bodyText, /Auth service 500 spike after deploy/);
  await page.close();
});

test("incident detail (/incidents/inc_auth500) renders live timeline from real API, desktop", async () => {
  const { page, response, consoleErrors, pageErrors, failedRequests, bodyText } = await visit(
    "/incidents/inc_auth500",
  );
  assert.equal(response.status(), 200);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  // Real event content from the seeded run, not an empty state or error boundary.
  // hypothesis/approval_requested render as dedicated cards (item 04), not generic
  // uppercase-event-type chips — assert on the real card content instead. Item 05 moved
  // HypothesisCard/AlternativesPanel prose behind the non-default "Evidence & Hypothesis"
  // tab, but GatePanel's ApprovalCard (claims/action/alternatives) stays always-visible
  // above the tabs per the hard "never hidden behind a tab" requirement — assert against
  // that on the default (Timeline) tab, then click into the other tab to confirm the
  // hypothesis content is really there too.
  assert.match(bodyText, /SUBAGENT_START/);
  assert.match(bodyText, /TOOL_CALL/);
  assert.match(bodyText, /RECOMMENDED ACTION/); // ApprovalCard label, always visible above tabs
  assert.match(bodyText, /Roll back commit a1b2c3d on auth-service/); // real seeded approval action
  assert.match(bodyText, /ALTERNATIVES/); // AlternativesPanel, inline not behind a click (copy trimmed item 08)
  assert.match(bodyText, /SessionValidator/); // ApprovalCard claim text, real seeded evidence
  assert.match(bodyText, /ACTION_EXECUTED/);
  assert.doesNotMatch(bodyText, /Incident not found/);

  // Evidence & Hypothesis tab: hypothesis content is real, just not default-mounted.
  await page.click('text="Evidence & Hypothesis"');
  await page.waitForTimeout(300);
  const evidenceTabText = await page.evaluate(() => document.body.innerText);
  assert.match(evidenceTabText, /ROOT CAUSE/); // HypothesisCard label
  assert.match(evidenceTabText, /SessionValidator/); // real seeded hypothesis rootCause text

  await page.close();
});

test("incident detail (/incidents/inc_imgupload) renders clarification round-trip, mobile", async () => {
  const { page, response, consoleErrors, pageErrors, failedRequests, bodyText } = await visit(
    "/incidents/inc_imgupload",
    { width: 390, height: 844 },
  );
  assert.equal(response.status(), 200);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  // clarification_requested/provided fold into ClarificationCard (item 04), not
  // generic uppercase-event-type chips — assert on the real dedicated-card content.
  assert.match(bodyText, /CLARIFICATION RESOLVED/); // ClarificationCard, answered state
  assert.match(bodyText, /AGENT IS ASKING/);
  assert.match(bodyText, /ON-CALL ANSWERED/);
  assert.match(bodyText, /nightly thumbnail-regeneration batch job/); // real seeded answer text
  await page.close();
});
