"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";

// `clarification_requested` gets its own distinct state, not a generic timeline row —
// per CONTRACT.md rule 5, "the agent knows what it doesn't know" is a harness-quality
// signal, not a dead end. Renders as a form the human could answer inline. The POST is
// real (hits the documented CONTRACT.md route); item 03 owns making that route live,
// so a 404 here degrades to a visible inline error rather than a silent no-op.

export function ClarificationCard({
  incidentId,
  question,
  gap,
  answer,
}: {
  incidentId: string;
  question: string;
  gap: string;
  answer?: string;
}) {
  const [localAnswer, setLocalAnswer] = useState<string | null>(answer ?? null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolved = localAnswer != null;

  async function submit() {
    if (!draft.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/clarifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer: draft }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setLocalAnswer(draft);
    } catch {
      setError("Clarification endpoint not live yet — answer was not recorded server-side.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card
      glow={resolved ? "accent" : "awaiting"}
      className={
        resolved
          ? "flex flex-col gap-5 p-7 sm:p-8"
          : "flex flex-col gap-5 !border-status-awaiting p-7 sm:p-8"
      }
    >
      <Chip tone={resolved ? "active" : "awaiting"}>
        clarification {resolved ? "resolved" : "requested"}
      </Chip>

      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">agent is asking</p>
        <p className="mt-2 text-base font-semibold leading-snug text-foreground">{question}</p>
      </div>

      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">why it&apos;s stuck</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{gap}</p>
      </div>

      {resolved ? (
        <div className="border-t border-border pt-5">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">on-call answered</p>
          <p className="mt-2 text-sm text-foreground/90">{localAnswer}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Answer inline to unblock the investigation…"
            className="min-h-16 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-status-awaiting/60 focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" disabled={submitting || !draft.trim()} onClick={submit}>
              Send answer
            </Button>
            {error && <p className="font-mono text-xs text-status-blocking">{error}</p>}
          </div>
        </div>
      )}
    </Card>
  );
}
