import Link from "next/link";
import { IncidentDetailClient } from "@/components/incident-detail-client";
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
        <IncidentDetailClient incident={detail.incident} initialEvents={detail.events} />
      )}
    </div>
  );
}
