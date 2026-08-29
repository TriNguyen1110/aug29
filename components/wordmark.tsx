import { Radar } from "lucide-react";
import Link from "next/link";

// The one signature brand moment in the console. History: "no visual brand"
// correction, then a same-day "use less gradient" correction (solid indigo-glow
// text) -- item 14 (explicitly re-authorized): the earlier "less gradient"
// complaint was about poor execution, not gradients categorically. The list-page
// hero (`lg`) now uses a real bg-clip-text gradient (bright indigo -> dimmer
// foreground), same top-left-to-dimmer direction as the reference hero this item
// adapts. `sm` (detail page back-nav row) keeps the solid glow treatment, out of
// this item's scope.

export function Wordmark({ size = "lg", href }: { size?: "lg" | "sm"; href?: string }) {
  const isLg = size === "lg";
  const mark = (
    <span className={`flex items-center gap-2.5 ${isLg ? "animate-hero-fade-in" : ""}`}>
      <span
        className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-accent/15 ${
          isLg ? "h-14 w-14" : "h-6 w-6"
        }`}
      >
        <span className="absolute inset-0 rounded-full border border-accent/50 animate-radar-ping" />
        <Radar className="relative text-accent" size={isLg ? 28 : 13} strokeWidth={1.8} />
      </span>
      <span
        className={
          isLg
            ? "bg-gradient-to-br from-accent from-20% to-foreground/45 bg-clip-text font-mono text-5xl font-semibold tracking-[-0.03em] text-transparent"
            : "text-wordmark-glow font-mono text-sm font-semibold tracking-[-0.03em]"
        }
      >
        Snitch
      </span>
    </span>
  );

  return href ? <Link href={href}>{mark}</Link> : mark;
}
