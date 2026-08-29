// Seeds two past, fully-resolved incidents with complete event histories so
// GET /api/incidents is never empty before a live trigger (CONTRACT.md "Seed data").
// These are fixed, deterministic history — not live subagent output — so all evidence
// excerpts below are hand-authored fixtures representing what a real tool call would have
// returned, not fabricated claims about a live run (the no-fabrication rule applies to the
// live harness call in item 03, not to writing plausible historical seed fixtures here).

import type { Approval, Incident, IncidentEvent } from "./types";
import { addApproval, addIncident, appendEvent, isSeeded, markSeeded } from "./store";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq.toString(36)}`;
}

function mkEvent(
  incidentId: string,
  ts: string,
  type: IncidentEvent["type"],
  payload: Record<string, unknown>
): IncidentEvent {
  return { id: nextId("evt"), incidentId, ts, type, payload };
}

export function seedPastIncidents(): void {
  if (isSeeded()) return;

  seedAuthIncident();
  seedImageUploadIncident();

  markSeeded();
}

// ---------------------------------------------------------------------------
// Incident 1: Auth service 500 spike after a bad deploy — resolved via rollback.
// ---------------------------------------------------------------------------
function seedAuthIncident(): void {
  const incidentId = "inc_auth500";
  const base = Date.parse("2026-08-27T09:14:00Z");
  const t = (offsetSec: number) => new Date(base + offsetSec * 1000).toISOString();

  const incident: Incident = {
    id: incidentId,
    title: "Case 1: Auth service 500 spike after a bad deploy",
    status: "resolved",
    createdAt: t(0),
  };
  addIncident(incident);

  const approvalId = "appr_auth500_1";

  const events: IncidentEvent[] = [
    mkEvent(incidentId, t(2), "subagent_start", {
      agent: "logs",
      task: "Pull error-rate and stack-trace samples for auth-service around the spike window",
      allowedTools: ["log_query"],
    }),
    mkEvent(incidentId, t(6), "tool_call", {
      agent: "logs",
      tool: "log_query",
      input: "service=auth-service level=error window=09:00-09:15",
      output:
        "09:11:02 auth-service ERROR 512 requests failed with 500: NullPointerException at SessionValidator.validate (SessionValidator.java:88)\n09:11:04 auth-service ERROR rate=61% (baseline 0.4%)",
    }),
    mkEvent(incidentId, t(9), "tool_call", {
      agent: "logs",
      tool: "log_query",
      input: "service=auth-service level=error window=08:45-09:11",
      output:
        "No 500s in this window — error rate flat at 0.3-0.5% until 09:11:00, then step-changes to 61%.",
    }),
    mkEvent(incidentId, t(12), "subagent_result", {
      agent: "logs",
      finding:
        "Error rate step-changed from ~0.4% to 61% at exactly 09:11:00, all failures the same NullPointerException in SessionValidator.validate.",
      evidence: [
        {
          source: "log",
          ref: "auth-service.log:09:11:02",
          excerpt:
            "ERROR 512 requests failed with 500: NullPointerException at SessionValidator.validate (SessionValidator.java:88)",
        },
      ],
    }),
    mkEvent(incidentId, t(14), "subagent_start", {
      agent: "diff",
      task: "Check recent deploys/commits to auth-service around 09:11 UTC",
      allowedTools: ["git_log", "git_show"],
    }),
    mkEvent(incidentId, t(18), "tool_call", {
      agent: "diff",
      tool: "git_log",
      input: "repo=auth-service since=2026-08-27T08:30:00Z",
      output: "a1b2c3d 2026-08-27T09:09:41Z deploy-bot \"Refactor session validation, drop null guard\"",
    }),
    mkEvent(incidentId, t(22), "tool_call", {
      agent: "diff",
      tool: "git_show",
      input: "commit=a1b2c3d path=src/main/java/SessionValidator.java",
      output:
        "- if (session == null) { return INVALID; }\n+ // null check removed, assumed upstream guarantees non-null session\n  return session.validate();",
    }),
    mkEvent(incidentId, t(25), "subagent_result", {
      agent: "diff",
      finding:
        "Commit a1b2c3d, deployed 09:09:41 (90s before the spike), removed the null-session guard in SessionValidator.validate — matches the exact exception seen in the logs.",
      evidence: [
        {
          source: "commit",
          ref: "commit a1b2c3d, line 88",
          excerpt: "// null check removed, assumed upstream guarantees non-null session",
        },
        {
          source: "diff",
          ref: "commit a1b2c3d, SessionValidator.java",
          excerpt: "- if (session == null) { return INVALID; }",
        },
      ],
    }),
    mkEvent(incidentId, t(27), "subagent_start", {
      agent: "external",
      task: "Check whether any upstream/session-provider dependency changed behavior at 09:11 UTC",
      allowedTools: ["bdata_scrape"],
    }),
    mkEvent(incidentId, t(31), "tool_call", {
      agent: "external",
      tool: "bdata_scrape",
      input: "collector=c_auth_dep_status url=https://status.auth-provider.example.com/",
      output: "All systems operational. No incidents reported in the last 24 hours.",
    }),
    mkEvent(incidentId, t(33), "subagent_result", {
      agent: "external",
      finding:
        "No external incident or dependency change around 09:11 UTC — nothing on the upstream session-provider status page.",
      evidence: [
        {
          source: "external",
          ref: "https://status.auth-provider.example.com/, collector c_auth_dep_status, fetched 2026-08-27T09:11:33Z",
          excerpt: "All systems operational. No incidents reported in the last 24 hours.",
        },
      ],
    }),
    mkEvent(incidentId, t(36), "hypothesis", {
      rootCause:
        "Commit a1b2c3d removed the null-session guard in SessionValidator.validate; sessions that are legitimately null under normal load now throw instead of returning INVALID, causing the 500 spike.",
      proposedFix: "Roll back auth-service to the commit before a1b2c3d.",
      claims: [
        {
          text: "The 500 spike began at 09:11:00, all failures the same NullPointerException in SessionValidator.validate.",
          evidence: [
            {
              source: "log",
              ref: "auth-service.log:09:11:02",
              excerpt:
                "ERROR 512 requests failed with 500: NullPointerException at SessionValidator.validate (SessionValidator.java:88)",
            },
          ],
        },
        {
          text: "Commit a1b2c3d, deployed 09:09:41 (90s before the spike), removed the null-session guard that this exception is thrown from.",
          evidence: [
            {
              source: "commit",
              ref: "commit a1b2c3d, line 88",
              excerpt: "// null check removed, assumed upstream guarantees non-null session",
            },
          ],
        },
        {
          text: "No external dependency incident coincides with the spike, ruling out an upstream cause.",
          evidence: [
            {
              source: "external",
              ref: "https://status.auth-provider.example.com/, collector c_auth_dep_status, fetched 2026-08-27T09:11:33Z",
              excerpt: "All systems operational. No incidents reported in the last 24 hours.",
            },
          ],
        },
      ],
    }),
    mkEvent(incidentId, t(38), "approval_requested", {
      approvalId,
      action: "Roll back commit a1b2c3d on auth-service",
      claims: [
        {
          text: "The 500 spike began at 09:11:00, all failures the same NullPointerException in SessionValidator.validate.",
          evidence: [
            {
              source: "log",
              ref: "auth-service.log:09:11:02",
              excerpt:
                "ERROR 512 requests failed with 500: NullPointerException at SessionValidator.validate (SessionValidator.java:88)",
            },
          ],
        },
        {
          text: "Commit a1b2c3d, deployed 09:09:41, removed the null-session guard that this exception is thrown from.",
          evidence: [
            {
              source: "commit",
              ref: "commit a1b2c3d, line 88",
              excerpt: "// null check removed, assumed upstream guarantees non-null session",
            },
          ],
        },
      ],
      actionSpec: {
        type: "rollback",
        target: "auth-service",
        params: { commit: "a1b2c3d" },
      },
      alternatives: [
        {
          description: "Re-add the null guard as a hotfix commit instead of a full rollback",
          tradeoff:
            "Smaller diff, but requires a fresh deploy under incident pressure and doesn't undo whatever else shipped in a1b2c3d.",
        },
        {
          description: "Restart auth-service instances",
          tradeoff:
            "Fast, but the bad commit stays deployed — the NullPointerException recurs on the next null session.",
        },
      ],
    }),
    mkEvent(incidentId, t(52), "approval_granted", { approvalId }),
    mkEvent(incidentId, t(58), "action_executed", {
      action: "Roll back commit a1b2c3d on auth-service",
      actionSpec: {
        type: "rollback",
        target: "auth-service",
        params: { commit: "a1b2c3d" },
      },
      result:
        "Simulated rollback of auth-service to pre-a1b2c3d. Error rate returned to 0.4% within 60s of the (simulated) deploy completing.",
    }),
    mkEvent(incidentId, t(65), "summary_posted", {
      channel: "#incidents",
      text:
        "Auth service 500 spike (09:11 UTC) traced to commit a1b2c3d removing a null-session guard. Rolled back. Error rate back to baseline. Evidence: auth-service.log:09:11:02, commit a1b2c3d line 88.",
    }),
  ];

  const approval: Approval = {
    id: approvalId,
    incidentId,
    action: "Roll back commit a1b2c3d on auth-service",
    actionSpec: { type: "rollback", target: "auth-service", params: { commit: "a1b2c3d" } },
    claims: [
      {
        text: "The 500 spike began at 09:11:00, all failures the same NullPointerException in SessionValidator.validate.",
        evidence: [
          {
            source: "log",
            ref: "auth-service.log:09:11:02",
            excerpt:
              "ERROR 512 requests failed with 500: NullPointerException at SessionValidator.validate (SessionValidator.java:88)",
          },
        ],
      },
      {
        text: "Commit a1b2c3d, deployed 09:09:41, removed the null-session guard that this exception is thrown from.",
        evidence: [
          {
            source: "commit",
            ref: "commit a1b2c3d, line 88",
            excerpt: "// null check removed, assumed upstream guarantees non-null session",
          },
        ],
      },
    ],
    alternatives: [
      {
        description: "Re-add the null guard as a hotfix commit instead of a full rollback",
        tradeoff:
          "Smaller diff, but requires a fresh deploy under incident pressure and doesn't undo whatever else shipped in a1b2c3d.",
      },
      {
        description: "Restart auth-service instances",
        tradeoff:
          "Fast, but the bad commit stays deployed — the NullPointerException recurs on the next null session.",
      },
    ],
    status: "approved",
    requestedAt: t(38),
    resolvedAt: t(52),
  };
  addApproval(approval);

  for (const e of events) appendEvent(e);
}

// ---------------------------------------------------------------------------
// Incident 2: Image upload latency regression — resolved via feature-flag toggle,
// with a clarification round-trip since evidence alone didn't nail the cause.
// ---------------------------------------------------------------------------
function seedImageUploadIncident(): void {
  const incidentId = "inc_imgupload";
  const base = Date.parse("2026-08-28T15:40:00Z");
  const t = (offsetSec: number) => new Date(base + offsetSec * 1000).toISOString();

  const incident: Incident = {
    id: incidentId,
    title: "Case 2: Image upload latency regression",
    status: "resolved",
    createdAt: t(0),
  };
  addIncident(incident);

  const approvalId = "appr_imgupload_1";

  const events: IncidentEvent[] = [
    mkEvent(incidentId, t(2), "subagent_start", {
      agent: "logs",
      task: "Pull p95/p99 latency samples for image-upload-service over the last hour",
      allowedTools: ["log_query"],
    }),
    mkEvent(incidentId, t(6), "tool_call", {
      agent: "logs",
      tool: "log_query",
      input: "service=image-upload-service metric=latency_p95 window=14:40-15:40",
      output:
        "14:40-15:10 p95=420ms (baseline). 15:10-15:40 p95=3100ms, climbing linearly, no errors thrown.",
    }),
    mkEvent(incidentId, t(10), "subagent_result", {
      agent: "logs",
      finding:
        "p95 latency climbed from 420ms to 3100ms starting 15:10, linear not step-shaped, zero error-rate change.",
      evidence: [
        {
          source: "log",
          ref: "image-upload-service.log:15:10-15:40",
          excerpt: "15:10-15:40 p95=3100ms, climbing linearly, no errors thrown.",
        },
      ],
    }),
    mkEvent(incidentId, t(12), "subagent_start", {
      agent: "diff",
      task: "Check recent deploys/commits to image-upload-service around 15:10 UTC",
      allowedTools: ["git_log", "git_show"],
    }),
    mkEvent(incidentId, t(16), "tool_call", {
      agent: "diff",
      tool: "git_log",
      input: "repo=image-upload-service since=2026-08-28T13:00:00Z",
      output: "No commits in this window. Last deploy was 2026-08-27T18:22:00Z, unrelated (README update).",
    }),
    mkEvent(incidentId, t(19), "subagent_result", {
      agent: "diff",
      finding: "No recent deploy correlates with the 15:10 latency climb.",
      evidence: [],
    }),
    mkEvent(incidentId, t(21), "subagent_start", {
      agent: "external",
      task: "Check the object-storage provider's status page for degradation around 15:10 UTC",
      allowedTools: ["bdata_scrape"],
    }),
    mkEvent(incidentId, t(25), "tool_call", {
      agent: "external",
      tool: "bdata_scrape",
      input: "collector=c_storage_status url=https://status.storage-provider.example.com/",
      output: "All systems operational. No incidents reported.",
    }),
    mkEvent(incidentId, t(27), "subagent_result", {
      agent: "external",
      finding: "No external storage-provider incident around the latency climb.",
      evidence: [
        {
          source: "external",
          ref: "https://status.storage-provider.example.com/, collector c_storage_status, fetched 2026-08-28T15:40:27Z",
          excerpt: "All systems operational. No incidents reported.",
        },
      ],
    }),
    mkEvent(incidentId, t(30), "clarification_requested", {
      question:
        "No deploy and no upstream incident explain a linear (not step-shaped) latency climb with zero errors — is there a known traffic ramp, batch job, or storage-quota change on image-upload-service today?",
      gap:
        "Logs and diff rule out a code change; external rules out the storage provider. Without another signal, there isn't a backed claim for root cause yet.",
    }),
    mkEvent(incidentId, t(95), "clarification_provided", {
      question:
        "No deploy and no upstream incident explain a linear (not step-shaped) latency climb with zero errors — is there a known traffic ramp, batch job, or storage-quota change on image-upload-service today?",
      answer:
        "Yes — a nightly thumbnail-regeneration batch job was moved earlier today to start at 15:10 UTC instead of 02:00 UTC, and it shares the same upload worker pool.",
    }),
    mkEvent(incidentId, t(98), "hypothesis", {
      rootCause:
        "The thumbnail-regeneration batch job, rescheduled to 15:10 UTC, shares the upload worker pool with live traffic and saturates it, producing the linear latency climb with no errors and no deploy correlation.",
      proposedFix: "Toggle the `thumbnail_batch_shares_upload_pool` flag off to isolate the batch job onto its own pool.",
      claims: [
        {
          text: "Latency climb started 15:10 UTC, linear and error-free — consistent with resource contention, not a code fault.",
          evidence: [
            {
              source: "log",
              ref: "image-upload-service.log:15:10-15:40",
              excerpt: "15:10-15:40 p95=3100ms, climbing linearly, no errors thrown.",
            },
          ],
        },
        {
          text: "The thumbnail batch job was moved to start at 15:10 UTC and shares the upload worker pool — provided via on-call clarification, not directly observed in logs or diff.",
          evidence: [],
        },
      ],
    }),
    mkEvent(incidentId, t(100), "approval_requested", {
      approvalId,
      action: "Toggle thumbnail_batch_shares_upload_pool off on image-upload-service",
      claims: [
        {
          text: "Latency climb started 15:10 UTC, linear and error-free — consistent with resource contention, not a code fault.",
          evidence: [
            {
              source: "log",
              ref: "image-upload-service.log:15:10-15:40",
              excerpt: "15:10-15:40 p95=3100ms, climbing linearly, no errors thrown.",
            },
          ],
        },
        {
          text: "The thumbnail batch job was moved to start at 15:10 UTC and shares the upload worker pool — no direct evidence found for this in logs or diff, provided by on-call via clarification only.",
          evidence: [],
        },
      ],
      actionSpec: {
        type: "toggle_flag",
        target: "image-upload-service",
        params: { flag: "thumbnail_batch_shares_upload_pool", value: "false" },
      },
      alternatives: [
        {
          description: "Move the batch job back to its 02:00 UTC schedule instead of toggling the pool flag",
          tradeoff:
            "Addresses the same contention without a flag change, but requires a scheduler config deploy rather than a runtime toggle — slower to apply mid-incident.",
        },
        {
          description: "Scale up the upload worker pool instead of isolating the batch job",
          tradeoff:
            "Doesn't require touching the batch job, but costs more continuously and doesn't fix the underlying pool-sharing design issue.",
        },
      ],
    }),
    mkEvent(incidentId, t(120), "approval_granted", { approvalId }),
    mkEvent(incidentId, t(126), "action_executed", {
      action: "Toggle thumbnail_batch_shares_upload_pool off on image-upload-service",
      actionSpec: {
        type: "toggle_flag",
        target: "image-upload-service",
        params: { flag: "thumbnail_batch_shares_upload_pool", value: "false" },
      },
      result:
        "Simulated flag toggle applied. p95 latency returned to 430ms within 90s of the (simulated) toggle taking effect.",
    }),
    mkEvent(incidentId, t(135), "summary_posted", {
      channel: "#incidents",
      text:
        "Image upload p95 latency climb (15:10 UTC) traced to the rescheduled thumbnail batch job contending for the upload worker pool (confirmed via on-call clarification, not directly observable in logs). Toggled the pool-sharing flag off. Latency back to baseline.",
    }),
  ];

  const approval: Approval = {
    id: approvalId,
    incidentId,
    action: "Toggle thumbnail_batch_shares_upload_pool off on image-upload-service",
    actionSpec: {
      type: "toggle_flag",
      target: "image-upload-service",
      params: { flag: "thumbnail_batch_shares_upload_pool", value: "false" },
    },
    claims: [
      {
        text: "Latency climb started 15:10 UTC, linear and error-free — consistent with resource contention, not a code fault.",
        evidence: [
          {
            source: "log",
            ref: "image-upload-service.log:15:10-15:40",
            excerpt: "15:10-15:40 p95=3100ms, climbing linearly, no errors thrown.",
          },
        ],
      },
      {
        text: "The thumbnail batch job was moved to start at 15:10 UTC and shares the upload worker pool — no direct evidence found for this in logs or diff, provided by on-call via clarification only.",
        evidence: [],
      },
    ],
    alternatives: [
      {
        description: "Move the batch job back to its 02:00 UTC schedule instead of toggling the pool flag",
        tradeoff:
          "Addresses the same contention without a flag change, but requires a scheduler config deploy rather than a runtime toggle — slower to apply mid-incident.",
      },
      {
        description: "Scale up the upload worker pool instead of isolating the batch job",
        tradeoff:
          "Doesn't require touching the batch job, but costs more continuously and doesn't fix the underlying pool-sharing design issue.",
      },
    ],
    status: "approved",
    requestedAt: t(100),
    resolvedAt: t(120),
  };
  addApproval(approval);

  for (const e of events) appendEvent(e);
}
