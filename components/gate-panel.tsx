import type { ActionSpec, Alternative, Claim, IncidentEvent } from "@/lib/types";
import { ApprovalCard } from "@/components/approval-card";
import { ClarificationCard } from "@/components/clarification-card";

// Item 05 (H+0.9/H+0.92 course-correction): the pending-approval banner and the
// approval/clarification cards must never be hidden inside a tab — "unmissable" is a
// hard requirement carried over from item 04. This renders every approval_requested and
// clarification_requested (resolved or not) as its own dedicated card, always above the
// Timeline/Evidence tabs, regardless of which tab is selected.

export function GatePanel({ events }: { events: IncidentEvent[] }) {
  const ordered = [...events].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );

  const approvals = ordered.filter((e) => e.type === "approval_requested");
  const clarifications = ordered.filter((e) => e.type === "clarification_requested");

  if (approvals.length === 0 && clarifications.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {clarifications.map((event) => {
        const p = event.payload as { question?: string; gap?: string };
        const answer = ordered.find(
          (e) =>
            e.type === "clarification_provided" &&
            (e.payload as { question?: string }).question === p.question,
        );
        return (
          <ClarificationCard
            key={event.id}
            incidentId={event.incidentId}
            question={p.question ?? ""}
            gap={p.gap ?? ""}
            answer={(answer?.payload as { answer?: string } | undefined)?.answer}
          />
        );
      })}

      {approvals.map((event) => {
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
          <ApprovalCard
            key={event.id}
            incidentId={event.incidentId}
            approvalId={approvalId}
            action={p.action ?? ""}
            actionSpec={p.actionSpec ?? { type: "restart", target: "", params: {} }}
            claims={p.claims ?? []}
            alternatives={p.alternatives ?? []}
            status={status}
          />
        );
      })}
    </div>
  );
}
