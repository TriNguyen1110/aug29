// Bordered tag — retheme of willder's pill.tsx: rounded-md instead of rounded-full
// (per design rule: square/rounded-md corners, no pill shapes), dot colors map to
// the reserved status palette.
type Dot = "resolved" | "awaiting" | "blocking" | "active" | "neutral";

const DOTS: Record<Dot, string> = {
  resolved: "bg-status-resolved",
  awaiting: "bg-status-awaiting",
  blocking: "bg-status-blocking",
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
      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2.5 py-1 text-xs text-foreground/70 ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOTS[dot]}`} />}
      {children}
    </span>
  );
}
