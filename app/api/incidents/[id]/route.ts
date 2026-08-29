import { NextResponse } from "next/server";
import { seedPastIncidents } from "@/lib/seed";
import { getEvents, getIncident } from "@/lib/store";

// GET /api/incidents/:id — current Incident plus its full IncidentEvent[] so far
// (CONTRACT.md). Shape: { incident, events }.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  seedPastIncidents();

  const { id } = await params;
  const incident = getIncident(id);

  if (!incident) {
    return NextResponse.json({ error: `No incident with id ${id}` }, { status: 404 });
  }

  const events = getEvents(id);

  return NextResponse.json({ incident, events });
}
