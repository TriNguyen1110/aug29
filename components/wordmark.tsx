import { Radar } from "lucide-react";
import Link from "next/link";

// The one signature brand moment in the console (2026-08-29 "no visual brand"
// correction, then a same-day "use less gradient" correction) — a radar-sweep
// mark (the product watches for incidents) plus a solid indigo-glow wordmark,
// instead of plain gray eyebrow text or a gradient-fill title. `sm` is the
// compact variant for the detail page's back-nav row; `lg` is the list page
// hero.

export function Wordmark({ size = "lg", href }: { size?: "lg" | "sm"; href?: string }) {
  const isLg = size === "lg";
  const mark = (
    <span className="flex items-center gap-2.5">
      <span
        className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-accent/15 ${
          isLg ? "h-14 w-14" : "h-6 w-6"
        }`}
      >
        <span className="absolute inset-0 rounded-full border border-accent/50 animate-radar-ping" />
        <Radar className="relative text-accent" size={isLg ? 28 : 13} strokeWidth={1.8} />
      </span>
      <span
        className={`text-wordmark-glow font-mono font-semibold tracking-[-0.03em] ${
          isLg ? "text-5xl" : "text-sm"
        }`}
      >
        Snitch
      </span>
    </span>
  );

  return href ? <Link href={href}>{mark}</Link> : mark;
}
