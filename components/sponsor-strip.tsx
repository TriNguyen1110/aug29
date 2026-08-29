// Persistent sponsor/stack strip (item 05 scope-add, H+0.92) — static text describing the
// real stack actually running this build, not simulated/canned incident data. Renders in
// app/layout.tsx so it's visible on every page (list + detail), tiny and out of the way.

export function SponsorStrip() {
  return (
    <div className="border-t border-border bg-surface/60">
      <p className="mx-auto max-w-3xl px-6 py-2.5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        TrueForge harness · OpenAI gpt-5-5 + gpt-5-4-mini · Bright Data external evidence · Qodo-reviewed
      </p>
    </div>
  );
}
