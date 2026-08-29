// Surface panel — same craft as willder's card.tsx (rounded-2xl, per-accent top
// glow bar + soft downward fill, ambient elevation shadow), recolored from
// willder's gold/ember/brick to this app's indigo accent + status amber/red —
// per the 2026-08-29 correction: keep the depth/glow treatment wholesale, swap
// only the palette. glow: false (none) | true/"accent" | "awaiting" | "blocking".
type GlowColor = "accent" | "awaiting" | "blocking";

const BAR: Record<GlowColor, string> = {
  accent: "from-accent/0 via-accent/60 to-accent/0",
  awaiting: "from-status-awaiting/0 via-status-awaiting/60 to-status-awaiting/0",
  blocking: "from-status-blocking/0 via-status-blocking/60 to-status-blocking/0",
};

const FILL: Record<GlowColor, string> = {
  accent: "from-accent/[0.08]",
  awaiting: "from-status-awaiting/[0.08]",
  blocking: "from-status-blocking/[0.08]",
};

export function Card({
  glow = false,
  className = "",
  children,
}: {
  glow?: boolean | GlowColor;
  className?: string;
  children: React.ReactNode;
}) {
  const color: GlowColor | null = glow === true ? "accent" : glow === false ? null : glow;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_8px_28px_-16px_rgba(0,0,0,0.85)] ${className}`}
    >
      {color && (
        <>
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${BAR[color]}`}
          />
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${FILL[color]} to-transparent`}
          />
        </>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
