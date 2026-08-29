"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/chip";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { EvidenceBlock } from "@/components/evidence-block";
import type { IncidentEvent } from "@/lib/types";

// Item 05: the Timeline tab is now the *raw* chronological event log only — hypothesis,
// approval_requested/granted/denied, and clarification_requested/provided moved out to
// the always-visible gate panel / dedicated Evidence & Hypothesis tab so this tab isn't
// duplicating them. `tool_call` and `subagent_result` rows are expanded to their real
// excerpt/raw content per the original item 05 ask, not a one-line summary. `external`
// agent tool_calls and `scrape_issue` get distinct "via Bright Data" treatment (H+0.91).
//
// Item 16: real-content-in-the-timeline (item 05) landed as raw excerpt/output dumped
// straight inline, which read as a wall of data. `tool_call` input/output and long
// `subagent_result` findings now show a short truncated preview plus a "View details"
// trigger that opens the full, untruncated raw content in components/ui/modal.tsx — the
// full content is still one click away, never hidden, just not dumped by default.

const PREVIEW_LIMIT = 150;

// Truncates to the first line or PREVIEW_LIMIT chars, whichever is shorter, so a long
// single-line excerpt and a multi-line log dump both collapse to a readable preview.
function truncate(text: string): { preview: string; isTruncated: boolean } {
  const firstLine = text.split("\n")[0] ?? "";
  const isTruncated = text.length > PREVIEW_LIMIT || text.includes("\n");
  const preview =
    firstLine.length > PREVIEW_LIMIT ? `${firstLine.slice(0, PREVIEW_LIMIT)}…` : isTruncated ? `${firstLine}…` : firstLine;
  return { preview, isTruncated };
}

function ViewDetailsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent underline-offset-2 hover:underline"
    >
      View details
    </button>
  );
}

const HIDDEN_TYPES = new Set<IncidentEvent["type"]>([
  "hypothesis",
  "approval_requested",
  "approval_granted",
  "approval_denied",
  "clarification_requested",
  "clarification_provided",
]);

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

const TONE: Record<string, "resolved" | "awaiting" | "blocking" | "active" | "muted"> = {
  subagent_start: "muted",
  tool_call: "muted",
  subagent_result: "active",
  scrape_issue: "blocking",
  scrape_repaired: "resolved",
  action_executed: "resolved",
  summary_posted: "muted",
};

// bdata_scrape tool_call input is written by lib/harness.ts as the literal string
// `collector=<id> url=<url>` — parse it back out for the Bright Data credit line rather
// than re-deriving it from data/targets.json (the input string is the exact real call).
function parseBrightDataInput(input: string): { collectorId: string; url: string } | null {
  const match = /collector=(\S+)\s+url=(\S+)/.exec(input);
  if (!match) return null;
  return { collectorId: match[1], url: match[2] };
}

const SCRAPE_ISSUE_LABEL: Record<string, string> = {
  bot_wall: "KYC / compliance block",
  selector_drift: "selector drift (site structure changed)",
  rate_limit: "rate limited",
  network: "network failure",
  unknown: "unknown failure",
};

function ScrapeIssueRow({ event }: { event: IncidentEvent }) {
  const p = event.payload as { targetUrl?: string; collectorId?: string; cause?: string; note?: string };
  const cause = p.cause ?? "unknown";
  return (
    <Card glow="blocking" className="!border-status-blocking/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-status-blocking">
          <span className="h-1.5 w-1.5 rounded-full bg-status-blocking shadow-[0_0_8px_1px] shadow-status-blocking/70" />
          Bright Data scrape blocked — {SCRAPE_ISSUE_LABEL[cause] ?? cause}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          collector {p.collectorId ?? "unknown"}
        </span>
      </div>
      <p className="mt-2 truncate font-mono text-xs text-muted">{p.targetUrl}</p>
      <p className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/85">
        {p.note}
      </p>
    </Card>
  );
}

function ToolCallRow({ event }: { event: IncidentEvent }) {
  const p = event.payload as { agent?: string; tool?: string; input?: string; output?: string };
  const brightData = p.tool === "bdata_scrape" ? parseBrightDataInput(String(p.input ?? "")) : null;
  const [open, setOpen] = useState(false);

  const input = p.input ?? "";
  const output = p.output ?? "";
  const inputPreview = truncate(input);
  const outputPreview = truncate(output);
  const canExpand = inputPreview.isTruncated || outputPreview.isTruncated;

  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="muted">tool_call</Chip>
          <span className="font-mono text-xs text-foreground/80">
            {p.agent} → {p.tool}
          </span>
          {brightData && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
              via Bright Data · {brightData.collectorId}
            </span>
          )}
        </div>
        {brightData && (
          <p className="mt-2 truncate font-mono text-xs text-muted">{brightData.url}</p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">input</p>
            <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs leading-relaxed text-foreground/85">
              {inputPreview.preview}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">output</p>
            <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs leading-relaxed text-foreground/85">
              {outputPreview.preview}
            </p>
          </div>
        </div>
        {canExpand && <ViewDetailsButton onClick={() => setOpen(true)} />}
      </Card>
      {open && (
        <Modal title={`${p.agent} → ${p.tool}`} onClose={() => setOpen(false)} size="2xl">
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">input</p>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs leading-relaxed text-foreground/85">
                {input}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">output</p>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs leading-relaxed text-foreground/85">
                {output}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function SubagentResultRow({ event }: { event: IncidentEvent }) {
  const p = event.payload as { agent?: string; finding?: string; evidence?: import("@/lib/types").Evidence[] };
  const [open, setOpen] = useState(false);
  const finding = p.finding ?? "";
  const findingPreview = truncate(finding);

  return (
    <>
      <Card glow="accent" className="p-4">
        <div className="flex items-center gap-2">
          <Chip tone="active">subagent_result</Chip>
          <span className="font-mono text-xs text-foreground/80">{p.agent}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          {findingPreview.isTruncated ? findingPreview.preview : finding}
        </p>
        {findingPreview.isTruncated && <ViewDetailsButton onClick={() => setOpen(true)} />}
        {(p.evidence?.length ?? 0) > 0 && (
          <div className="mt-3">
            <EvidenceBlock evidence={p.evidence ?? []} />
          </div>
        )}
      </Card>
      {open && (
        <Modal title={`${p.agent} — finding`} onClose={() => setOpen(false)} size="xl">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
            {finding}
          </p>
        </Modal>
      )}
    </>
  );
}

function summarize(event: IncidentEvent): string {
  const p = event.payload ?? {};
  switch (event.type) {
    case "subagent_start":
      return `${p.agent ?? "agent"} started — ${p.task ?? ""}`;
    case "scrape_repaired":
      return `scraper repaired: ${p.collectorId ?? ""}`;
    case "action_executed":
      return `action executed: ${p.action ?? ""}`;
    case "summary_posted":
      return `summary posted to ${p.channel ?? ""}`;
    default:
      return event.type;
  }
}

function GenericRow({ event }: { event: IncidentEvent }) {
  const p = event.payload as Record<string, unknown>;
  const detail = event.type === "action_executed" ? String(p.result ?? "") : event.type === "summary_posted" ? String(p.text ?? "") : "";
  return (
    <li className="rounded-xl border border-border bg-surface-raised px-4 py-3 shadow-[0_6px_20px_-14px_rgba(0,0,0,0.9)]">
      <div className="flex gap-4">
        <span className="w-20 shrink-0 pt-0.5 font-mono text-xs text-muted">{formatTs(event.ts)}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Chip tone={TONE[event.type] ?? "muted"}>{event.type}</Chip>
          <p className="text-sm text-foreground/90">{summarize(event)}</p>
          {detail && (
            <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/70">
              {detail}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function TimelineSlot({ ts, children }: { ts: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="w-20 shrink-0 pt-1 font-mono text-xs text-muted">{formatTs(ts)}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

export function EventTimeline({ events }: { events: IncidentEvent[] }) {
  const ordered = [...events]
    .filter((e) => !HIDDEN_TYPES.has(e.type))
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  if (ordered.length === 0) {
    return <p className="text-sm text-muted">No raw events recorded for this incident yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {ordered.map((event) => {
        if (event.type === "tool_call") {
          return (
            <TimelineSlot key={event.id} ts={event.ts}>
              <ToolCallRow event={event} />
            </TimelineSlot>
          );
        }
        if (event.type === "subagent_result") {
          return (
            <TimelineSlot key={event.id} ts={event.ts}>
              <SubagentResultRow event={event} />
            </TimelineSlot>
          );
        }
        if (event.type === "scrape_issue") {
          return (
            <TimelineSlot key={event.id} ts={event.ts}>
              <ScrapeIssueRow event={event} />
            </TimelineSlot>
          );
        }
        return <GenericRow key={event.id} event={event} />;
      })}
    </ul>
  );
}
