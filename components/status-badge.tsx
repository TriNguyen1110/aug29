import { Search, Clock, Wrench, CheckCircle2 } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import type { IncidentStatus } from "@/lib/types";

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

const ICON: Record<IncidentStatus, typeof Search> = {
  investigating: Search,
  awaiting_approval: Clock,
  remediating: Wrench,
  resolved: CheckCircle2,
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  const Icon = ICON[status];
  return (
    <Pill dot={DOT[status]}>
      <Icon size={12} strokeWidth={1.8} />
      <span className="font-mono">{LABEL[status]}</span>
    </Pill>
  );
}
