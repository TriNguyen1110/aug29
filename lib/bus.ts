// Minimal pub/sub so GET /api/incidents/:id/stream can push each IncidentEvent as it's
// produced instead of polling (CONTRACT.md). Kept on globalThis like lib/store.ts so it
// survives Next dev-mode module reloads.

import type { IncidentEvent } from "./types";

type Listener = (event: IncidentEvent) => void;

const globalKey = "__incidentAgentBus__" as const;

function getListeners(): Map<string, Set<Listener>> {
  const g = globalThis as typeof globalThis & { [globalKey]?: Map<string, Set<Listener>> };
  if (!g[globalKey]) g[globalKey] = new Map();
  return g[globalKey];
}

export function publish(incidentId: string, event: IncidentEvent): void {
  const set = getListeners().get(incidentId);
  if (!set) return;
  for (const listener of set) listener(event);
}

export function subscribe(incidentId: string, listener: Listener): () => void {
  const listeners = getListeners();
  if (!listeners.has(incidentId)) listeners.set(incidentId, new Set());
  const set = listeners.get(incidentId)!;
  set.add(listener);
  return () => set.delete(listener);
}
