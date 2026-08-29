import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { runIncident } from "@/lib/harness";

// POST /api/incidents/trigger — body { scenario }, starts a real run, returns
// { incidentId } immediately. The run itself continues in the background; the frontend
// follows it live via GET /api/incidents/:id/stream (CONTRACT.md).
export async function POST(request: Request) {
  const body = await request.json().catch((err) => {
    // A malformed body is not the same as an omitted one — log it server-side rather than
    // silently treating both as "use the default scenario" (Qodo PR #1 finding, H+2.2f).
    console.error("POST /api/incidents/trigger: failed to parse request body as JSON:", err);
    return {};
  });
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
