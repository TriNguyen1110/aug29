import { ChevronRight } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { IncidentList } from "@/components/incident-list";
import { TriggerForm } from "@/components/trigger-form";
import { ValueProps } from "@/components/value-props";
import { SideGutters } from "@/components/side-gutters";
import { getIncidents } from "@/app/lib/api";

// Item 14 hero pass: adapts the reference hero-1.tsx's visual ideas (gradient title,
// eyebrow chip w/ hover chevron, grid backdrop, fade-in/up entrance) without copying
// its JSX/props/shadcn deps.
//
// Item 21 rewrite (real user feedback): the eyebrow/subtitle text plus the 3 value-prop
// chips below were too abstract to answer, in a 10-second skim, who this is for, what it
// actually checks, Bright Data's specific role, and how it differs from a dashboard. The
// eyebrow now states the audience (who it's for), the subtitle states the dashboard
// difference (one claim to approve, not raw data to interpret), and the 3-step flow in
// ValueProps below covers what's checked + Bright Data's specific role. See
// components/value-props.tsx for that half of the rewrite.

export default async function Home() {
  const incidents = await getIncidents();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-20 sm:py-24">
      {/* Item 15: fills the dead empty side margins outside this max-w-3xl column at wide
          viewports with a faint gutter-scoped shader. Fixed-position + -z-10, so its DOM
          position doesn't matter for layout — placed here to keep it list-page-scoped. */}
      <SideGutters />
      <header className="relative flex flex-col gap-6 border-b border-border pb-10">
        {/* Faint grid-line backdrop, additional layer above the WebGL waves
            background (unchanged, still mounted in app/layout.tsx) — masked so it
            fades toward the header's edges instead of hard-cutting. */}
        <div className="hero-grid-backdrop pointer-events-none absolute -inset-x-6 -top-10 -z-10 h-[26rem]" />
        <div className="group inline-flex w-fit animate-hero-fade-in items-center gap-2 rounded-full border border-accent/25 bg-gradient-to-r from-accent/10 via-accent/5 to-transparent px-4 py-1.5">
          <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
            For on-call engineers &amp; SREs, triggered like a page
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-accent transition-transform duration-300 group-hover:translate-x-1" />
        </div>
        <Wordmark size="lg" />
        <p
          className="max-w-xl animate-hero-fade-up text-base leading-relaxed tracking-[-0.005em] text-muted"
          style={{ animationDelay: "0.15s" }}
        >
          One evidence-backed claim to approve — not a dashboard of logs to interpret yourself.
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
