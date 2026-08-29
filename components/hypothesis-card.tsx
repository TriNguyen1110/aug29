import type { Claim } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ClaimItem } from "@/components/claim-item";

// Dedicated rendering for a `hypothesis` event — not a one-line summary. Root cause,
// proposed fix, and every claim with its evidence (or lack of it) inline. Root cause
// gets real typographic weight (the willder card-glow + display-scale treatment,
// recolored to the indigo accent) since it's the thing the rest of the screen justifies.

export function HypothesisCard({
  rootCause,
  proposedFix,
  claims,
}: {
  rootCause: string;
  proposedFix: string;
  claims: Claim[];
}) {
  return (
    <Card glow="accent" className="flex flex-col gap-5 p-5">
      <Chip tone="active">hypothesis</Chip>

      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">root cause</p>
        <p className="mt-1.5 text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">
          {rootCause}
        </p>
      </div>

      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">proposed fix</p>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{proposedFix}</p>
      </div>

      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-muted">
          claims ({claims.length})
        </p>
        <ul className="flex flex-col gap-2">
          {claims.map((c, i) => (
            <ClaimItem key={i} claim={c} />
          ))}
        </ul>
      </div>
    </Card>
  );
}
