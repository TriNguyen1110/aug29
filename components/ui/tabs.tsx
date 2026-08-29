"use client";

// Reusable controlled tabs — retheme of willder's tabs.tsx: rounded-md segmented
// track instead of rounded-full, accent-tinted active segment instead of plain white.
export type TabItem = { key: string; label: string };

export function Tabs({
  items,
  value,
  onChange,
  className = "",
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex gap-1 rounded-md border border-border bg-surface p-1 ${className}`}>
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            value === it.key
              ? "bg-accent/15 text-foreground"
              : "text-muted hover:text-foreground/80"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
