import { FlaskConical, Radio } from "lucide-react";
import { Pill } from "@/components/ui/pill";

// Mid-task correction: a viewer can't otherwise tell a historical fixture from something
// actually triggered live just now. The two seeded past incidents (CONTRACT.md/BOARD.tsv
// fact H+0.37) have fixed, known ids; every live-triggered incident gets `inc_<uuid>` from
// app/api/incidents/trigger/route.ts — that's enough to derive the distinction without a
// new backend field, the same way Bright Data info is parsed from an existing payload
// shape rather than a dedicated field.
const SEEDED_IDS = new Set(["inc_auth500", "inc_imgupload"]);

export function isSeeded(incidentId: string): boolean {
  return SEEDED_IDS.has(incidentId);
}

export function SeededBadge({ incidentId }: { incidentId: string }) {
  return isSeeded(incidentId) ? (
    <Pill dot="neutral">
      <FlaskConical size={12} strokeWidth={1.8} />
      <span className="font-mono">Seeded</span>
    </Pill>
  ) : (
    <Pill dot="active">
      <Radio size={12} strokeWidth={1.8} />
      <span className="font-mono">Live</span>
    </Pill>
  );
}
