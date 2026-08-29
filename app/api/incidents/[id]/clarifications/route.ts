import { NextResponse } from "next/server";
import { getIncident } from "@/lib/store";
import { resolveClarification } from "@/lib/harness";

// POST /api/incidents/:id/clarifications — body { question, answer }. Resolves a
// clarification_requested event (CONTRACT.md rule 5) and wakes the suspended run so
// investigation can resume with the added context.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const answer = body?.answer;

  if (typeof answer !== "string" || !answer.trim()) {
    return NextResponse.json({ error: "answer must be a non-empty string" }, { status: 400 });
  }

  const incident = getIncident(id);
  if (!incident) {
    return NextResponse.json({ error: `No incident with id ${id}` }, { status: 404 });
  }

  const woke = resolveClarification(id, answer.trim());
  if (!woke) {
    return NextResponse.json({ error: `Incident ${id} has no run waiting on a clarification` }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
