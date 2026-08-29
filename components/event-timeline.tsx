import { Chip } from "@/components/ui/chip";
import type { IncidentEvent } from "@/app/lib/types";

// One event per row (incident.io convention), timestamped, monospace for the
// technical payload detail, sans for the human-readable label line. This renders
// every event type generically and read-only for now — interactive approve/deny
// and evidence-per-claim rendering on the approval screen is item 04, not this one.

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

const TONE: Record<string, "resolved" | "awaiting" | "blocking" | "active" | "muted"> = {
  subagent_start: "muted",
  tool_call: "muted",
  subagent_result: "active",
  scrape_issue: "blocking",
  scrape_repaired: "resolved",
  clarification_requested: "awaiting",
  clarification_provided: "active",
  hypothesis: "active",
  approval_requested: "awaiting",
  approval_granted: "resolved",
  approval_denied: "blocking",
  action_executed: "resolved",
  summary_posted: "muted",
};

function summarize(event: IncidentEvent): string {
  const p = event.payload ?? {};
  switch (event.type) {
    case "subagent_start":
      return `${p.agent ?? "agent"} started — ${p.task ?? ""}`;
    case "tool_call":
      return `${p.agent ?? "agent"} called ${p.tool ?? "tool"}`;
    case "subagent_result":
      return `${p.agent ?? "agent"} finding: ${p.finding ?? ""}`;
    case "scrape_issue":
      return `scrape issue on ${p.collectorId ?? "collector"} (${p.cause ?? "unknown"})`;
    case "scrape_repaired":
      return `scraper repaired: ${p.collectorId ?? ""}`;
    case "clarification_requested":
      return `clarification requested: ${p.question ?? ""}`;
    case "clarification_provided":
      return `clarification provided: ${p.answer ?? ""}`;
    case "hypothesis":
      return `hypothesis: ${p.rootCause ?? ""}`;
    case "approval_requested":
      return `approval requested: ${p.action ?? ""}`;
    case "approval_granted":
      return `approval granted (${p.approvalId ?? ""})`;
    case "approval_denied":
      return `approval denied (${p.approvalId ?? ""})`;
    case "action_executed":
      return `action executed: ${p.action ?? ""}`;
    case "summary_posted":
      return `summary posted to ${p.channel ?? ""}`;
    default:
      return event.type;
  }
}

function EventRow({ event }: { event: IncidentEvent }) {
  return (
    <li className="flex gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <span className="w-20 shrink-0 pt-0.5 font-mono text-xs text-muted">
        {formatTs(event.ts)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Chip tone={TONE[event.type] ?? "muted"}>{event.type}</Chip>
        </div>
        <p className="truncate text-sm text-foreground/90">{summarize(event)}</p>
      </div>
    </li>
  );
}

export function EventTimeline({ events }: { events: IncidentEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted">No events recorded for this incident.</p>;
  }

  const ordered = [...events].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );

  return (
    <ul className="overflow-hidden rounded-md border border-border bg-surface">
      {ordered.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </ul>
  );
}
