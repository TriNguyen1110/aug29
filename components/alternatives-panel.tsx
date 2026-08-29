import type { Alternative } from "@/lib/types";

// Per CONTRACT.md rule 4: alternatives sit next to the recommendation, tradeoff
// readable at a glance — never hidden behind a click. An empty list is itself a
// signal (the agent didn't document other options) and is called out, not hidden.

export function AlternativesPanel({ alternatives }: { alternatives: Alternative[] }) {
  if (alternatives.length === 0) {
    return (
      <p className="font-mono text-xs text-status-blocking">
        No alternatives recorded — the agent did not document other options considered.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {alternatives.map((a, i) => (
        <li key={i} className="rounded-xl border border-border bg-background/40 px-3.5 py-2.5 shadow-[0_4px_16px_-10px_rgba(0,0,0,0.9)]">
          <p className="text-sm text-foreground/80">{a.description}</p>
          <p className="mt-1 font-mono text-xs leading-relaxed text-muted">tradeoff: {a.tradeoff}</p>
        </li>
      ))}
    </ul>
  );
}
