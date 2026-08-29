"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import type { ActionSpec, Alternative, Claim } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { ClaimItem } from "@/components/claim-item";
import { AlternativesPanel } from "@/components/alternatives-panel";

type Status = "pending" | "approved" | "denied";

// The approval gate — the one screen a judge is told to remember. `pending` must be
// visually unmissable (strong border/background, "action required" tag), never styled
// like a resolved row. Claims render with their evidence inline; alternatives sit next
// to the recommendation, not behind a click. Approve/Deny POST to the documented
// CONTRACT.md route; item 03 owns making that route real — this degrades to a visible
// inline error rather than pretending the decision was recorded if it 404s.

export function ApprovalCard({
  incidentId,
  approvalId,
  action,
  actionSpec,
  claims,
  alternatives,
  status,
}: {
  incidentId: string;
  approvalId: string;
  action: string;
  actionSpec: ActionSpec;
  claims: Claim[];
  alternatives: Alternative[];
  status: Status;
}) {
  const [localStatus, setLocalStatus] = useState<Status>(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPending = localStatus === "pending";

  async function decide(decision: "approve" | "deny") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/approvals/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setLocalStatus(decision === "approve" ? "approved" : "denied");
    } catch {
      setError("Approval endpoint not live yet — decision was not recorded server-side.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      glow={isPending ? "awaiting" : undefined}
      className={
        isPending
          ? "flex flex-col gap-6 !border-status-awaiting p-7"
          : "flex flex-col gap-6 p-7"
      }
    >
      <div id={`approval-${approvalId}`} className="flex flex-wrap items-center justify-between gap-2">
        <Chip tone={isPending ? "awaiting" : localStatus === "approved" ? "resolved" : "blocking"}>
          approval {localStatus}
        </Chip>
        {isPending && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-status-awaiting/50 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em] text-status-awaiting shadow-[0_0_16px_-4px_rgba(245,158,11,0.7)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-awaiting shadow-[0_0_8px_1px] shadow-status-awaiting/70" />
            action required
          </span>
        )}
      </div>

      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">recommended action</p>
        <p className="mt-1.5 text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">
          {action}
        </p>
        <p className="mt-1.5 font-mono text-xs text-muted">
          {actionSpec.type} → {actionSpec.target}
          {Object.entries(actionSpec.params).length > 0 &&
            " · " + Object.entries(actionSpec.params).map(([k, v]) => `${k}=${v}`).join(" ")}
        </p>
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

      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-muted">
          alternatives ({alternatives.length})
        </p>
        <AlternativesPanel alternatives={alternatives} />
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2 border-t border-border pt-5">
          <div className="flex gap-3">
            <Button variant="primary" size="md" disabled={busy} onClick={() => decide("approve")} className="gap-1.5">
              <Check size={15} strokeWidth={2} />
              Approve
            </Button>
            <Button variant="danger" size="md" disabled={busy} onClick={() => decide("deny")} className="gap-1.5">
              <X size={15} strokeWidth={2} />
              Deny
            </Button>
          </div>
          {error && <p className="font-mono text-xs text-status-blocking">{error}</p>}
        </div>
      ) : (
        <p className="font-mono text-xs text-muted">resolved: {localStatus}</p>
      )}
    </Card>
  );
}
