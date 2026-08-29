// Surface panel — the standard dark card. Retheme of willder's card.tsx: dropped the
// per-accent top-bar glow treatment entirely, square corners, plain low-opacity border.
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border border-border bg-surface ${className}`}>
      {children}
    </div>
  );
}
