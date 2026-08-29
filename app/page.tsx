import { PageHeader } from "@/components/ui/page-header";
import { IncidentList } from "@/components/incident-list";
import { TriggerForm } from "@/components/trigger-form";
import { getIncidents } from "@/app/lib/api";

export default async function Home() {
  const incidents = await getIncidents();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <PageHeader eyebrow="Incident Responder" title="Incidents">
        Investigates an incident across logs, recent deploys, and live external signals
        (e.g. is a vendor down), then proposes a fix with evidence behind every claim —
        nothing executes until a human approves it. Trigger a run below, or open a past
        incident for its full event timeline.
      </PageHeader>
      <TriggerForm />
      <IncidentList incidents={incidents} />
    </div>
  );
}
