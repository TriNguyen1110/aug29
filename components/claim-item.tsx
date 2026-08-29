import type { Claim } from "@/lib/types";
import { EvidenceBlock } from "@/components/evidence-block";

// The core differentiator per CONTRACT.md: a claim with evidence must look visibly
// different from one without. An empty `evidence` array is not styled the same as a
// backed claim — it gets a loud "unverified / inferred only" tag, blocking-tone border.

export function ClaimItem({ claim }: { claim: Claim }) {
  const backed = claim.evidence.length > 0;

  return (
    <li
      className={
        backed
          ? "rounded-xl border border-border bg-surface-raised px-4 py-3.5 shadow-[0_6px_20px_-14px_rgba(0,0,0,0.9)]"
          : "rounded-xl border border-status-blocking/50 bg-status-blocking/[0.06] px-4 py-3.5 shadow-[0_0_24px_-10px_rgba(239,68,68,0.35)]"
      }
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-sm text-foreground/90">{claim.text}</p>
        {backed ? (
          <span className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-status-resolved">
            {claim.evidence.length} evidence
          </span>
        ) : (
          <span className="shrink-0 whitespace-nowrap rounded-full border border-status-blocking/40 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-status-blocking shadow-[0_0_10px_-2px_rgba(239,68,68,0.6)]">
            unverified — inferred only
          </span>
        )}
      </div>
      <EvidenceBlock evidence={claim.evidence} />
    </li>
  );
}
