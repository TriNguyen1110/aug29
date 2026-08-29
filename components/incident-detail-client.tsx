"use client";

import { useEffect, useMemo, useState } from "react";
import { History, FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { SeededBadge } from "@/components/seeded-badge";
import { EventTimeline } from "@/components/event-timeline";
import { EvidenceHypothesisPanel } from "@/components/evidence-hypothesis-panel";
import { GatePanel } from "@/components/gate-panel";
import { PendingApprovalBanner } from "@/components/pending-approval-banner";
import type { Incident, IncidentEvent } from "@/lib/types";

// Item 05 (H+0.9): wires the incident detail view to the real live SSE stream
// (GET /api/incidents/:id/stream) for a non-resolved incident, and splits the page into
// a tabbed layout (Timeline vs. Evidence & Hypothesis) while keeping the pending-approval
// banner and gate panel (approval/clarification cards) always visible above the tabs.
// The two seeded resolved incidents never had a live run to stream, so they render off
// the server-fetched events only — opening an EventSource against them would just replay
// the same history and immediately idle, so it's skipped per the task's own carve-out.

// Status is derived client-side from the live event stream rather than re-fetched, since
// the SSE payload is IncidentEvent[], not Incident — this mirrors exactly the status
// transitions lib/harness.ts performs server-side (investigating -> awaiting_approval ->
// remediating -> resolved), so the badge stays accurate without an extra request.
function deriveStatus(events: IncidentEvent[], fallback: Incident["status"]): Incident["status"] {
  if (events.length === 0) return fallback;

  const approvalsRequested = events.filter((e) => e.type === "approval_requested");
  const resolvedApprovalIds = new Set(
    events
      .filter((e) => e.type === "approval_granted" || e.type === "approval_denied")
      .map((e) => (e.payload as { approvalId?: string }).approvalId),
  );
  const hasPendingApproval = approvalsRequested.some(
    (e) => !resolvedApprovalIds.has((e.payload as { approvalId?: string }).approvalId),
  );

  if (events.some((e) => e.type === "summary_posted")) return "resolved";
  if (events.some((e) => e.type === "approval_granted")) return "remediating";
  if (hasPendingApproval) return "awaiting_approval";
  return "investigating";
}

export function IncidentDetailClient({
  incident,
  initialEvents,
}: {
  incident: Incident;
  initialEvents: IncidentEvent[];
}) {
  const [events, setEvents] = useState<IncidentEvent[]>(initialEvents);
  const [tab, setTab] = useState<"timeline" | "evidence">("timeline");

  const isLive = incident.status !== "resolved";

  useEffect(() => {
    if (!isLive) return;

    const source = new EventSource(`/api/incidents/${incident.id}/stream`);
    source.onmessage = (msg) => {
      try {
        const event: IncidentEvent = JSON.parse(msg.data);
        setEvents((prev) => (prev.some((e) => e.id === event.id) ? prev : [...prev, event]));
      } catch {
        // Malformed SSE payload — drop it rather than crash the live view.
      }
    };
    source.onerror = () => {
      // EventSource auto-retries on transient errors; nothing to surface here since a
      // reconnect just replays history from the store (see stream route) and catches up.
    };

    return () => source.close();
    // incident.id/isLive don't change for a mounted detail page — this connects once.
  }, [incident.id, isLive]);

  const status = useMemo(
    () => (isLive ? deriveStatus(events, incident.status) : incident.status),
    [events, incident.status, isLive],
  );

  return (
    <div className="flex flex-col gap-8">
      <PendingApprovalBanner events={events} />
      <PageHeader eyebrow={`Incident · ${incident.id}`} title={incident.title}>
        <span className="font-mono text-xs">{incident.createdAt}</span>
      </PageHeader>
      <div className="flex items-center gap-3">
        <StatusBadge status={status} />
        <SeededBadge incidentId={incident.id} />
        {isLive && (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-active" />
            live
          </span>
        )}
      </div>

      <GatePanel events={events} />

      <div className="flex flex-col gap-5">
        <Tabs
          items={[
            { key: "timeline", label: "Timeline", icon: <History size={15} strokeWidth={1.8} /> },
            {
              key: "evidence",
              label: "Evidence & Hypothesis",
              icon: <FlaskConical size={15} strokeWidth={1.8} />,
            },
          ]}
          value={tab}
          onChange={(k) => setTab(k as "timeline" | "evidence")}
        />

        {tab === "timeline" ? (
          <EventTimeline events={events} />
        ) : (
          <EvidenceHypothesisPanel events={events} />
        )}
      </div>
    </div>
  );
}
