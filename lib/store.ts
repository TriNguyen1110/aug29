// Single in-memory store for the whole process — matches the "one process, one DB (or
// in-memory)" stack rule in CLAUDE.md. No separate DB service.
//
// Persisted on `globalThis` rather than a plain module-level variable so that Next.js dev-mode
// module reloads (HMR) don't wipe seeded data out from under a live demo run.

import type { Approval, Incident, IncidentEvent } from "./types";

type Store = {
  incidents: Map<string, Incident>;
  events: Map<string, IncidentEvent[]>; // incidentId -> ordered event log
  approvals: Map<string, Approval>; // approvalId -> Approval
  seeded: boolean;
};

const globalKey = "__incidentAgentStore__" as const;

function createStore(): Store {
  return {
    incidents: new Map(),
    events: new Map(),
    approvals: new Map(),
    seeded: false,
  };
}

function getStore(): Store {
  const g = globalThis as typeof globalThis & { [globalKey]?: Store };
  if (!g[globalKey]) {
    g[globalKey] = createStore();
  }
  return g[globalKey];
}

export function isSeeded(): boolean {
  return getStore().seeded;
}

export function markSeeded(): void {
  getStore().seeded = true;
}

export function addIncident(incident: Incident): void {
  const store = getStore();
  store.incidents.set(incident.id, incident);
  if (!store.events.has(incident.id)) {
    store.events.set(incident.id, []);
  }
}

export function updateIncidentStatus(
  incidentId: string,
  status: Incident["status"]
): void {
  const store = getStore();
  const incident = store.incidents.get(incidentId);
  if (!incident) throw new Error(`updateIncidentStatus: unknown incident ${incidentId}`);
  store.incidents.set(incidentId, { ...incident, status });
}

// Appended the moment it happens, never batched — per backend-agent rules.
export function appendEvent(event: IncidentEvent): void {
  const store = getStore();
  if (!store.incidents.has(event.incidentId)) {
    throw new Error(`appendEvent: unknown incident ${event.incidentId}`);
  }
  const list = store.events.get(event.incidentId) ?? [];
  list.push(event);
  store.events.set(event.incidentId, list);
}

export function listIncidents(): Incident[] {
  const store = getStore();
  return Array.from(store.incidents.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getIncident(id: string): Incident | undefined {
  return getStore().incidents.get(id);
}

export function getEvents(incidentId: string): IncidentEvent[] {
  return getStore().events.get(incidentId) ?? [];
}

export function addApproval(approval: Approval): void {
  getStore().approvals.set(approval.id, approval);
}

export function getApproval(approvalId: string): Approval | undefined {
  return getStore().approvals.get(approvalId);
}

export function updateApproval(approval: Approval): void {
  getStore().approvals.set(approval.id, approval);
}
