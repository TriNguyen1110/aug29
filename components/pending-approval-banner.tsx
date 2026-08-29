import type { IncidentEvent } from "@/lib/types";

// The approval gate must be impossible to scroll past without noticing. This sits
// pinned to the top of the incident detail view whenever any approval on this
// incident is still `pending`, and links straight down to it.

export function PendingApprovalBanner({ events }: { events: IncidentEvent[] }) {
  const requested = events.filter((e) => e.type === "approval_requested");
  const resolvedIds = new Set(
    events
      .filter((e) => e.type === "approval_granted" || e.type === "approval_denied")
      .map((e) => (e.payload as { approvalId?: string }).approvalId),
  );
  const pending = requested.filter(
    (e) => !resolvedIds.has((e.payload as { approvalId?: string }).approvalId),
  );

  if (pending.length === 0) return null;

  const firstId = (pending[0].payload as { approvalId?: string }).approvalId ?? pending[0].id;

  return (
    <div className="sticky top-0 z-50 -mx-6 mb-10 border-b-2 border-status-awaiting bg-status-awaiting shadow-[0_4px_24px_-4px_rgba(245,158,11,0.6)] sm:-mx-6">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-6 py-4">
        <span className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-background">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-background/80" />
          {pending.length} approval{pending.length > 1 ? "s" : ""} awaiting your decision
        </span>
        <a
          href={`#approval-${firstId}`}
          className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-background underline"
        >
          jump to approval →
        </a>
      </div>
    </div>
  );
}
