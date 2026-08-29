import { NextResponse } from "next/server";
import { getApproval } from "@/lib/store";
import { resolveApproval } from "@/lib/harness";

// POST /api/incidents/:id/approvals/:approvalId — body { decision: "approve" | "deny" }.
// This is the real approval gate: resolveApproval() wakes up the `await` inside
// runIncident() that has been suspended since approval_requested was emitted. Nothing
// about the run proceeds until this resolves (CONTRACT.md, backend rule: "do not fake
// this one").
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; approvalId: string }> }
) {
  const { id, approvalId } = await params;
  const body = await request.json().catch(() => ({}));
  const decision = body?.decision;

  if (decision !== "approve" && decision !== "deny") {
    return NextResponse.json({ error: "decision must be \"approve\" or \"deny\"" }, { status: 400 });
  }

  const approval = getApproval(approvalId);
  if (!approval || approval.incidentId !== id) {
    return NextResponse.json({ error: `No pending approval ${approvalId} on incident ${id}` }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return NextResponse.json({ error: `Approval ${approvalId} already resolved as ${approval.status}` }, { status: 409 });
  }

  const woke = resolveApproval(approvalId, decision);
  if (!woke) {
    return NextResponse.json({ error: `Approval ${approvalId} has no run waiting on it (already resolved or run crashed)` }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
