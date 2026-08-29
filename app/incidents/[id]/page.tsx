import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EventTimeline } from "@/components/event-timeline";
import { PendingApprovalBanner } from "@/components/pending-approval-banner";
import { getIncidentDetail } from "@/app/lib/api";

export default async function IncidentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getIncidentDetail(id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <Link href="/" className="font-mono text-xs text-muted hover:text-foreground">
        ← all incidents
      </Link>

      {!detail ? (
        <p className="text-sm text-muted">Incident not found.</p>
      ) : (
        <>
          <PendingApprovalBanner events={detail.events} />
          <PageHeader eyebrow={`Incident · ${detail.incident.id}`} title={detail.incident.title}>
            <span className="font-mono text-xs">{detail.incident.createdAt}</span>
          </PageHeader>
          <div>
            <StatusBadge status={detail.incident.status} />
          </div>
          <EventTimeline events={detail.events} />
        </>
      )}
    </div>
  );
}
