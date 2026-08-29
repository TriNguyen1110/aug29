import { Pill } from "@/components/ui/pill";
import type { IncidentStatus } from "@/app/lib/types";

// Color is reserved for incident status only (per design rule), never used as chrome
// elsewhere in the console. resolved=green, awaiting_approval=amber, remediating/
// investigating get the neutral accent/muted tones — red is reserved for a future
// blocking/failed state, not used by any status in the current contract.
const LABEL: Record<IncidentStatus, string> = {
  investigating: "Investigating",
  awaiting_approval: "Awaiting approval",
  remediating: "Remediating",
  resolved: "Resolved",
};

const DOT: Record<IncidentStatus, "resolved" | "awaiting" | "active" | "neutral"> = {
  investigating: "neutral",
  awaiting_approval: "awaiting",
  remediating: "active",
  resolved: "resolved",
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <Pill dot={DOT[status]}>
      <span className="font-mono">{LABEL[status]}</span>
    </Pill>
  );
}
