import type { Evidence } from "@/lib/types";

// Renders the literal tool-output substring backing a claim — source + ref + verbatim
// excerpt, monospace throughout. This is the "check the agent's work yourself" surface
// per CONTRACT.md: never a paraphrase, always what a subagent actually pulled.

export function EvidenceBlock({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2.5">
      {evidence.map((e, i) => (
        <li className="rounded-xl border border-border bg-background/60 px-4 py-3 shadow-[0_4px_16px_-10px_rgba(0,0,0,0.9)]" key={i}>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <span>{e.source}</span>
            <span className="text-border-strong">·</span>
            <span className="min-w-0 truncate">{e.ref}</span>
          </div>
          <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
            {e.excerpt}
          </p>
        </li>
      ))}
    </ul>
  );
}
