import { Wordmark } from "@/components/wordmark";
import { IncidentList } from "@/components/incident-list";
import { TriggerForm } from "@/components/trigger-form";
import { ValueProps } from "@/components/value-props";
import { getIncidents } from "@/app/lib/api";

export default async function Home() {
  const incidents = await getIncidents();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-20 sm:py-24">
      <header className="flex flex-col gap-5 border-b border-border pb-10">
        <Wordmark size="lg" />
        <p className="max-w-xl text-base leading-relaxed tracking-[-0.005em] text-muted">
          Evidence-per-claim incident response — every root cause traces to receipts, not trust.
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
