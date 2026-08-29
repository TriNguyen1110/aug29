// Bordered tag — same rounded-full pill shape as willder's pill.tsx, dot colors
// map to the reserved status palette instead of brand hues. `awaiting`/`blocking`
// dots (actionable states) get a faint matching glow so they draw the eye instead
// of reading as a flat colored dot, per the 2026-08-29 craft correction.
type Dot = "resolved" | "awaiting" | "blocking" | "active" | "neutral";

const DOTS: Record<Dot, string> = {
  resolved: "bg-status-resolved",
  awaiting: "bg-status-awaiting shadow-[0_0_8px_1px] shadow-status-awaiting/70",
  blocking: "bg-status-blocking shadow-[0_0_8px_1px] shadow-status-blocking/70",
  active: "bg-status-active",
  neutral: "bg-muted",
};

export function Pill({
  dot,
  className = "",
  children,
}: {
  dot?: Dot;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-3 py-1 text-xs text-foreground/70 ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOTS[dot]}`} />}
      {children}
    </span>
  );
}
