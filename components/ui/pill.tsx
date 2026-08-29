// Bordered tag — same rounded-full pill shape as willder's pill.tsx, dot colors
// map to the reserved status palette instead of brand hues. `awaiting`/`blocking`
// dots (actionable states) get a faint matching glow so they draw the eye instead
// of reading as a flat colored dot, per the 2026-08-29 craft correction.
//
// 2026-08-29 legibility pass (real user feedback, BOARD.tsv item 10): every pill was
// rendering the same flat dark-charcoal shell (bg-surface-raised) regardless of state —
// only the small dot differed, which read as monotone/gray at a glance. Each `dot` tone
// now also carries a subtle background+border wash of its own color (`bg-*/10`,
// `border-*/25`) so the pill itself is legible as a color, not just its dot. `neutral`
// intentionally stays the plain dark shell — it means "no color assigned yet"
// (investigating status, seeded badge), so a tint there would be misleading. Kept to a
// low-opacity wash, not a solid fill, per the standing "restrained, no loud color" rule.
type Dot = "resolved" | "awaiting" | "blocking" | "active" | "neutral";

const DOTS: Record<Dot, string> = {
  resolved: "bg-status-resolved",
  awaiting: "bg-status-awaiting shadow-[0_0_8px_1px] shadow-status-awaiting/70",
  blocking: "bg-status-blocking shadow-[0_0_8px_1px] shadow-status-blocking/70",
  active: "bg-status-active",
  neutral: "bg-muted",
};

const TINTS: Record<Dot, string> = {
  resolved: "bg-status-resolved/10 border-status-resolved/25",
  awaiting: "bg-status-awaiting/10 border-status-awaiting/25",
  blocking: "bg-status-blocking/10 border-status-blocking/25",
  active: "bg-status-active/10 border-status-active/25",
  neutral: "bg-surface-raised border-border",
};

export function Pill({
  dot,
  icon,
  className = "",
  children,
}: {
  dot?: Dot;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const shell = dot ? TINTS[dot] : "bg-surface-raised border-border";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-foreground/70 ${shell} ${className}`}
    >
      {icon ?? (dot && <span className={`h-1.5 w-1.5 rounded-full ${DOTS[dot]}`} />)}
      {children}
    </span>
  );
}
