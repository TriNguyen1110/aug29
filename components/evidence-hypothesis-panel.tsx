import type { Alternative, Claim, IncidentEvent } from "@/lib/types";
import { HypothesisCard } from "@/components/hypothesis-card";
import { AlternativesPanel } from "@/components/alternatives-panel";

// Item 05: the actual product differentiator (evidence-per-claim + tradeoffs) gets its
// own uncluttered tab instead of being buried in the raw event scroll. The gate itself
// (approve/deny) stays outside the tabs per the always-visible requirement — this tab is
// for reviewing the reasoning, not making the decision.

export function EvidenceHypothesisPanel({ events }: { events: IncidentEvent[] }) {
  const hypothesisEvent = events.find((e) => e.type === "hypothesis");
  const approvalEvent = [...events]
    .reverse()
    .find((e) => e.type === "approval_requested");

  if (!hypothesisEvent) {
    return (
      <p className="text-sm text-muted">
        No hypothesis yet — investigation in progress.
      </p>
    );
  }

  const hp = hypothesisEvent.payload as {
    rootCause?: string;
    proposedFix?: string;
    claims?: Claim[];
  };
  const alternatives = approvalEvent
    ? ((approvalEvent.payload as { alternatives?: Alternative[] }).alternatives ?? [])
    : [];

  return (
    <div className="flex flex-col gap-5">
      <HypothesisCard
        rootCause={String(hp.rootCause ?? "")}
        proposedFix={String(hp.proposedFix ?? "")}
        claims={hp.claims ?? []}
      />
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-muted">
          alternatives ({alternatives.length})
        </p>
        <AlternativesPanel alternatives={alternatives} />
      </div>
    </div>
  );
}
