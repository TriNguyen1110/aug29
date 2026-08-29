import { Chip } from "@/components/ui/chip";
import { HypothesisCard } from "@/components/hypothesis-card";
import { ApprovalCard } from "@/components/approval-card";
import { ClarificationCard } from "@/components/clarification-card";
import type { ActionSpec, Alternative, Claim, IncidentEvent } from "@/lib/types";

// One event per row (incident.io convention), timestamped, monospace for the
// technical payload detail, sans for the human-readable label line — except
// `hypothesis`, `approval_requested`, and `clarification_requested`, which get
// dedicated rich cards (item 04): evidence-per-claim, alternatives w/ tradeoffs,
// and a distinct answerable clarification state, not one-line summaries.
// `approval_granted`/`approval_denied`/`clarification_provided` fold into their
// originating card instead of rendering as a second, redundant generic row.

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
    <li className="rounded-xl border border-border bg-surface-raised px-4 py-3 shadow-[0_6px_20px_-14px_rgba(0,0,0,0.9)]">
      <div className="flex gap-4">
        <span className="w-20 shrink-0 pt-0.5 font-mono text-xs text-muted">
          {formatTs(event.ts)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Chip tone={TONE[event.type] ?? "muted"}>{event.type}</Chip>
          </div>
          <p className="truncate text-sm text-foreground/90">{summarize(event)}</p>
        </div>
      </div>
    </li>
  );
}

function TimelineSlot({ ts, children }: { ts: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="w-20 shrink-0 pt-1 font-mono text-xs text-muted">{formatTs(ts)}</span>
      <div className="min-w-0 flex-1">{children}</div>
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

  // Resolution/answer events fold into the card of the event they resolve —
  // mark them consumed so they don't also render as a second generic row.
  const consumed = new Set<string>();
  for (const event of ordered) {
    if (event.type === "approval_requested") {
      const approvalId = (event.payload as { approvalId?: string }).approvalId;
      const resolution = ordered.find(
        (e) =>
          (e.type === "approval_granted" || e.type === "approval_denied") &&
          (e.payload as { approvalId?: string }).approvalId === approvalId,
      );
      if (resolution) consumed.add(resolution.id);
    }
    if (event.type === "clarification_requested") {
      const question = (event.payload as { question?: string }).question;
      const answer = ordered.find(
        (e) =>
          e.type === "clarification_provided" &&
          (e.payload as { question?: string }).question === question &&
          !consumed.has(e.id),
      );
      if (answer) consumed.add(answer.id);
    }
  }

  return (
    <ul className="flex flex-col gap-3">
      {ordered.map((event) => {
        if (consumed.has(event.id)) return null;

        if (event.type === "hypothesis") {
          const p = event.payload as {
            rootCause?: string;
            proposedFix?: string;
            claims?: Claim[];
          };
          return (
            <TimelineSlot key={event.id} ts={event.ts}>
              <HypothesisCard
                rootCause={String(p.rootCause ?? "")}
                proposedFix={String(p.proposedFix ?? "")}
                claims={p.claims ?? []}
              />
            </TimelineSlot>
          );
        }

        if (event.type === "approval_requested") {
          const p = event.payload as {
            approvalId?: string;
            action?: string;
            actionSpec?: ActionSpec;
            claims?: Claim[];
            alternatives?: Alternative[];
          };
          const approvalId = p.approvalId ?? event.id;
          const resolution = ordered.find(
            (e) =>
              (e.type === "approval_granted" || e.type === "approval_denied") &&
              (e.payload as { approvalId?: string }).approvalId === approvalId,
          );
          const status = resolution
            ? resolution.type === "approval_granted"
              ? "approved"
              : "denied"
            : "pending";
          return (
            <TimelineSlot key={event.id} ts={event.ts}>
              <ApprovalCard
                incidentId={event.incidentId}
                approvalId={approvalId}
                action={p.action ?? ""}
                actionSpec={p.actionSpec ?? { type: "restart", target: "", params: {} }}
                claims={p.claims ?? []}
                alternatives={p.alternatives ?? []}
                status={status}
              />
            </TimelineSlot>
          );
        }

        if (event.type === "clarification_requested") {
          const p = event.payload as { question?: string; gap?: string };
          const answer = ordered.find(
            (e) =>
              e.type === "clarification_provided" &&
              (e.payload as { question?: string }).question === p.question,
          );
          return (
            <TimelineSlot key={event.id} ts={event.ts}>
              <ClarificationCard
                incidentId={event.incidentId}
                question={p.question ?? ""}
                gap={p.gap ?? ""}
                answer={(answer?.payload as { answer?: string } | undefined)?.answer}
              />
            </TimelineSlot>
          );
        }

        return <EventRow key={event.id} event={event} />;
      })}
    </ul>
  );
}
