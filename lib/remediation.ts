// The one real side-effecting action in this system: executing an approved ActionSpec.
// This is now exposed to TrueForge as a GATED MCP TOOL (item 11) — the harness's native
// tool.approval_required pause is what genuinely blocks execution, not our own hand-rolled
// Promise. See app/api/mcp/remediation/route.ts for the MCP transport wiring and
// lib/trueforge.ts for the session/turn calls that drive the model into calling this tool
// and resuming it after a human decision.
//
// This function is pure/deterministic (CONTRACT.md rule 2: execute exactly the approved
// spec, never re-derive it) — the caller (the MCP tool handler) is responsible for having
// already verified the tool-call arguments match the stored, approved ActionSpec verbatim
// before this is ever invoked for real.
import type { ActionSpec } from "./types";

export function executeRemediation(spec: ActionSpec): string {
  return (
    `Simulated ${spec.type} on ${spec.target} with params ${JSON.stringify(spec.params)} — ` +
    "sandbox execution is simulated per CONTRACT.md's fallback table (real sandboxed exec was " +
    "cut for this build). Error rate returned to baseline within the simulated window."
  );
}
