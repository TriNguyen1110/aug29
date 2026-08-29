"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Real trigger UI (item 05, H+0.9): POSTs a scenario description to the real
// /api/incidents/trigger route (CONTRACT.md), then navigates to the returned incident's
// detail page. Placeholder text is a default hint, not a forced value — the input is
// editable, and an empty submit falls back to whatever the backend route itself defaults
// to (it does not require a non-empty body per app/api/incidents/trigger/route.ts).

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
