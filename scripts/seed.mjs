// npm run seed — sanity check for the two seeded past incidents (CONTRACT.md "Seed data").
//
// Seeding itself is lazy and idempotent: it happens in-process the first time any
// GET /api/incidents* route runs (see lib/seed.ts + lib/store.ts, one in-memory store per
// process, per the stack rule). This script just hits the already-running dev server
// (npm run dev, port 3000 — this script never starts its own server) and asserts the
// contract holds: at least 2 incidents, each with a non-empty event log.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  const listRes = await fetch(`${BASE_URL}/api/incidents`);
  if (!listRes.ok) {
    throw new Error(`GET /api/incidents failed: ${listRes.status} ${await listRes.text()}`);
  }
  const incidents = await listRes.json();

  if (!Array.isArray(incidents) || incidents.length < 2) {
    throw new Error(
      `Expected >= 2 seeded incidents, got ${Array.isArray(incidents) ? incidents.length : typeof incidents}`
    );
  }

  for (const incident of incidents) {
    const detailRes = await fetch(`${BASE_URL}/api/incidents/${incident.id}`);
    if (!detailRes.ok) {
      throw new Error(
        `GET /api/incidents/${incident.id} failed: ${detailRes.status} ${await detailRes.text()}`
      );
    }
    const detail = await detailRes.json();
    if (!Array.isArray(detail.events) || detail.events.length === 0) {
      throw new Error(`Incident ${incident.id} has no event history`);
    }
    console.log(`OK  ${incident.id}  "${incident.title}"  status=${incident.status}  events=${detail.events.length}`);
  }

  console.log(`Seed check passed: ${incidents.length} incidents, all with event histories.`);
}

main().catch((err) => {
  console.error("Seed check FAILED:", err.message);
  console.error("(Is `npm run dev` running on port 3000? This script never starts its own server.)");
  process.exit(1);
});
