// Data model — copied verbatim from CONTRACT.md (frozen). Do not diverge; if a field
// is missing here that the UI needs, that's a BOARD.tsv `blocked` row, not a local add.

export type IncidentStatus = "investigating" | "awaiting_approval" | "remediating" | "resolved";

export type Incident = {
  id: string;
  title: string;
  status: IncidentStatus;
  createdAt: string;
};

export type Evidence = {
  source: "log" | "diff" | "commit" | "external";
  ref: string;
  excerpt: string;
};

export type Claim = {
  text: string;
  evidence: Evidence[];
};

export type ActionSpec = {
  type: "rollback" | "restart" | "toggle_flag";
  target: string;
  params: Record<string, string>;
};

export type Alternative = {
  description: string;
  tradeoff: string;
};

export type IncidentEventType =
  | "subagent_start"
  | "tool_call"
  | "subagent_result"
  | "scrape_issue"
  | "scrape_repaired"
  | "clarification_requested"
  | "clarification_provided"
  | "hypothesis"
  | "approval_requested"
  | "approval_granted"
  | "approval_denied"
  | "action_executed"
  | "summary_posted";

export type IncidentEvent = {
  id: string;
  incidentId: string;
  ts: string;
  type: IncidentEventType;
  payload: Record<string, unknown>;
};

export type Approval = {
  id: string;
  incidentId: string;
  action: string;
  actionSpec: ActionSpec;
  claims: Claim[];
  alternatives: Alternative[];
  status: "pending" | "approved" | "denied";
  requestedAt: string;
  resolvedAt: string | null;
};
