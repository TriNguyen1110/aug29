import { ChevronRight } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { IncidentList } from "@/components/incident-list";
import { TriggerForm } from "@/components/trigger-form";
import { ValueProps } from "@/components/value-props";
import { getIncidents } from "@/app/lib/api";

// Item 14 hero pass: adapts the reference hero-1.tsx's visual ideas (gradient title,
// eyebrow chip w/ hover chevron, grid backdrop, fade-in/up entrance) without copying
// its JSX/props/shadcn deps. Copy is unchanged — the prior single tagline sentence
// "Evidence-per-claim incident response — every root cause traces to receipts, not
// trust." is split at its own dash into eyebrow (before) + subtitle (after), not
// rewritten or shortened.

export default async function Home() {
  const incidents = await getIncidents();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-20 sm:py-24">
      <header className="relative flex flex-col gap-6 border-b border-border pb-10">
        {/* Faint grid-line backdrop, additional layer above the WebGL waves
            background (unchanged, still mounted in app/layout.tsx) — masked so it
            fades toward the header's edges instead of hard-cutting. */}
        <div className="hero-grid-backdrop pointer-events-none absolute -inset-x-6 -top-10 -z-10 h-[26rem]" />
        <div className="group inline-flex w-fit animate-hero-fade-in items-center gap-2 rounded-full border border-accent/25 bg-gradient-to-r from-accent/10 via-accent/5 to-transparent px-4 py-1.5">
          <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
            Evidence-per-claim incident response
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-accent transition-transform duration-300 group-hover:translate-x-1" />
        </div>
        <Wordmark size="lg" />
        <p
          className="max-w-xl animate-hero-fade-up text-base leading-relaxed tracking-[-0.005em] text-muted"
          style={{ animationDelay: "0.15s" }}
        >
          Every root cause traces to receipts, not trust.
        </p>
      </header>
      <div className="pt-10">
        <ValueProps />
      </div>
      <div className="pt-14">
        <TriggerForm />
      </div>
      <div className="pt-16">
        <IncidentList incidents={incidents} />
      </div>
    </div>
  );
}
