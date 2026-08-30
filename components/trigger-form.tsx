"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Triangle, GitBranch, BellRing } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

// Real trigger UI (item 05, H+0.9): POSTs a scenario description to the real
// /api/incidents/trigger route (CONTRACT.md), then navigates to the returned incident's
// detail page. Placeholder text is a default hint, not a forced value — the input is
// editable, and an empty submit falls back to whatever the backend route itself defaults
// to (it does not require a non-empty body per app/api/incidents/trigger/route.ts).

// Item 22 (real user feedback): the trigger here is a manual button, but the product's own
// positioning (item 21's eyebrow chip) says "triggered like a page" — nothing on screen showed
// what that actually means concretely. This caption row is explicitly illustrative, not a real
// integration: plain lucide-react icon+label pairs standing in for the *kind* of thing that
// would fire this in a real deployment (a payment provider's webhook, a deploy platform's alert,
// a CI status check, a generic paging tool), worded as "in production, ..." rather than
// "connected to ..." so it can't be misread as a live connection.

// Item 23 (real user feedback on item 22): the plain inline icon+label text above was too
// subtle — testers missed the 4 sources entirely on first look because they blended into muted
// footnote text with no visible boundary. Each source now renders as its own small Pill (the
// existing components/ui/pill.tsx primitive, `neutral` shell — the same plain bordered chip
// used elsewhere for the "Seeded" badges, so this doesn't invent new styling) giving it a real
// background + border distinct from its neighbors. Kept at Pill's default small size (no size
// prop to bump) and still sat below the unchanged framing sentence, so the row reads as a
// clearer secondary detail, not a new hero section — still noticeably smaller/quieter than the
// trigger Card above and item 21's 3-step row further up.
const PRODUCTION_TRIGGERS = [
  { icon: CreditCard, label: "Stripe webhooks" },
  { icon: Triangle, label: "Vercel deployment alerts" },
  { icon: GitBranch, label: "GitHub status checks" },
  { icon: BellRing, label: "PagerDuty / Datadog" },
] as const;

export function TriggerForm() {
  const router = useRouter();
  const [scenario, setScenario] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/incidents/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenario.trim() || undefined }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (!data?.incidentId) throw new Error("no incidentId returned");
      router.push(`/incidents/${data.incidentId}`);
    } catch {
      setError("Trigger endpoint did not respond — no incident was started.");
      setBusy(false);
    }
  }

  return (
    <Card glow="accent" className="flex flex-col gap-4 p-7 sm:p-8">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        trigger a live investigation
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) trigger();
          }}
          placeholder="Checkout API error rate spike"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none"
        />
        <Button variant="primary" size="md" disabled={busy} onClick={trigger} className="shrink-0">
          {busy ? "Starting…" : "Trigger investigation"}
        </Button>
      </div>
      {error && <p className="font-mono text-xs text-status-blocking">{error}</p>}
    </Card>
  );
}

export function TriggerProvenanceNote() {
  return (
    <div className="flex flex-col gap-2 pt-3">
      <p className="text-xs text-muted/70">
        This button is a stand-in for the demo — in production, an investigation like this would
        be triggered automatically by your alerting, illustrated below.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {PRODUCTION_TRIGGERS.map(({ icon: Icon, label }) => (
          <Pill
            key={label}
            icon={<Icon size={12} strokeWidth={1.8} className="shrink-0 text-muted/70" />}
            className="text-muted/80"
          >
            {label}
          </Pill>
        ))}
      </div>
    </div>
  );
}
