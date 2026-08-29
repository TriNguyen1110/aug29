import { NextResponse } from "next/server";
import { seedPastIncidents } from "@/lib/seed";
import { listIncidents } from "@/lib/store";

// GET /api/incidents — list, most recent first. Seeded with 2 past resolved incidents so
// the dashboard is never empty before a live trigger (CONTRACT.md "Seed data").
export async function GET() {
  seedPastIncidents();

  const incidents = listIncidents();

  // Fail loudly rather than silently returning an empty dashboard — seeding is supposed to
  // guarantee at least 2 rows exist.
  if (incidents.length === 0) {
    throw new Error("listIncidents returned empty after seeding — seed logic is broken");
  }

  return NextResponse.json(incidents);
}
