// Small mono label — provenance marks, counts, event types. Retheme of willder's
// chip.tsx: tones map to the reserved status colors instead of brand warm colors.
type Tone = "resolved" | "awaiting" | "blocking" | "active" | "muted";

const TONES: Record<Tone, string> = {
  resolved: "text-status-resolved",
  awaiting: "text-status-awaiting",
  blocking: "text-status-blocking",
  active: "text-status-active",
  muted: "text-muted",
};

export function Chip({
  tone = "muted",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`font-mono text-xs uppercase tracking-[0.12em] ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
