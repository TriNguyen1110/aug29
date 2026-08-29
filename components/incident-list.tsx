import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { SeededBadge } from "@/components/seeded-badge";
import type { Incident } from "@/lib/types";

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function IncidentList({ incidents }: { incidents: Incident[] }) {
  if (incidents.length === 0) {
    return <p className="text-sm text-muted">No incidents yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {incidents.map((incident) => (
        <Link key={incident.id} href={`/incidents/${incident.id}`}>
          <Card className="flex items-center justify-between gap-4 px-6 py-5 transition-colors hover:border-border-strong">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="truncate text-sm font-medium text-foreground">
                {incident.title}
              </span>
              <span className="font-mono text-xs text-muted">
                {incident.id} · {formatTs(incident.createdAt)}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SeededBadge incidentId={incident.id} />
              <StatusBadge status={incident.status} />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
