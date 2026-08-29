import { PageHeader } from "@/components/ui/page-header";
import { IncidentList } from "@/components/incident-list";
import { getIncidents } from "@/app/lib/api";

export default async function Home() {
  const incidents = await getIncidents();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <PageHeader eyebrow="Incident Responder" title="Incidents">
        Seeded past incidents plus any live-triggered run. Click one for the full event
        timeline.
      </PageHeader>
      <IncidentList incidents={incidents} />
    </div>
  );
}
