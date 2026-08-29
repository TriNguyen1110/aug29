import type { Incident, IncidentEvent } from "./types";

// Fetch helpers against CONTRACT.md's documented API shapes (GET /api/incidents,
// GET /api/incidents/:id). As of this build, no backend `fact` row has been posted
// to BOARD.tsv confirming the exact response envelope, so this assumes the plainest
// reading of the contract:
//   GET /api/incidents            -> Incident[]
//   GET /api/incidents/:id        -> { incident: Incident, events: IncidentEvent[] }
// See BOARD.tsv `blocked` row (item 02) if backend's actual shape differs — never
// fabricate incident/event content here if the route 404s, just return null/[] and
// let the page render its one-line empty state per CLAUDE.md.

// Server Components can't use a relative fetch URL (no request origin to resolve
// against) — this is one process on a fixed port per CLAUDE.md, so default to it.
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function getIncidents(): Promise<Incident[]> {
  try {
    const res = await fetch(`${BASE}/api/incidents`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data as Incident[];
    if (Array.isArray(data?.incidents)) return data.incidents as Incident[];
    return [];
  } catch {
    return [];
  }
}

export async function getIncidentDetail(
  id: string,
): Promise<{ incident: Incident; events: IncidentEvent[] } | null> {
  try {
    const res = await fetch(`${BASE}/api/incidents/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const incident: Incident | undefined = data?.incident ?? data;
    const events: IncidentEvent[] = Array.isArray(data?.events)
      ? data.events
      : Array.isArray(data?.incident?.events)
        ? data.incident.events
        : [];
    if (!incident?.id) return null;
    return { incident, events };
  } catch {
    return null;
  }
}
