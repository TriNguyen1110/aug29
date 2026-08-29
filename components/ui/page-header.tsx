// Reusable page header — retheme of willder's page-header.tsx: dropped the
// fire-gradient display title and ember pulse dot for a quiet mono eyebrow +
// plain foreground title, matching the dev-console tone (Linear/Vercel, not brand).
export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-border pb-10">
      <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-muted">
        {eyebrow}
      </p>
      <h1 className="text-3xl font-semibold leading-tight tracking-[-0.015em] text-foreground">
        {title}
      </h1>
      {children && (
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{children}</p>
      )}
    </header>
  );
}
