import { Wordmark } from "@/components/wordmark";
import { IncidentList } from "@/components/incident-list";
import { TriggerForm } from "@/components/trigger-form";
import { ValueProps } from "@/components/value-props";
import { getIncidents } from "@/app/lib/api";

export default async function Home() {
  const incidents = await getIncidents();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-6 py-14">
      <header className="flex flex-col gap-4 border-b border-border pb-8">
        <Wordmark size="lg" />
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          Evidence-per-claim incident response — every root cause traces to receipts, not trust.
        </p>
      </header>
      <ValueProps />
      <TriggerForm />
      <IncidentList incidents={incidents} />
    </div>
  );
}
