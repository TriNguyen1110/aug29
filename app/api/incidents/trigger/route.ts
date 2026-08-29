import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { runIncident } from "@/lib/harness";

// POST /api/incidents/trigger — body { scenario }, starts a real run, returns
// { incidentId } immediately. The run itself continues in the background; the frontend
// follows it live via GET /api/incidents/:id/stream (CONTRACT.md).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const scenario = typeof body?.scenario === "string" && body.scenario.trim()
    ? body.scenario.trim()
    : "Checkout API error rate spike";

  const incidentId = `inc_${randomUUID()}`;

  // Fire-and-forget: the trigger response must return immediately per CONTRACT.md.
  // Errors are logged into the incident's own event log inside runIncident, and also
  // logged here so a total crash before the incident row exists isn't silent.
  runIncident(incidentId, scenario).catch((err) => {
    console.error(`runIncident(${incidentId}) failed:`, err);
  });

  return NextResponse.json({ incidentId });
}
