import { PageHeader } from "@/components/ui/page-header";
import { IncidentList } from "@/components/incident-list";
import { TriggerForm } from "@/components/trigger-form";
import { ValueProps } from "@/components/value-props";
import { getIncidents } from "@/app/lib/api";

export default async function Home() {
  const incidents = await getIncidents();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <PageHeader eyebrow="Incident response, with receipts" title="Incidents">
        Built for on-call engineers who need to know why something broke before they trust
        an agent&apos;s answer.
      </PageHeader>
      <ValueProps />
      <TriggerForm />
      <IncidentList incidents={incidents} />
    </div>
  );
}
