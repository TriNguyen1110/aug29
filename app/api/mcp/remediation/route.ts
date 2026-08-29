// Real MCP server, hosted in-process on this same Next.js app (port 3000), exposing
// exactly one gated tool: execute_remediation. TrueForge is registered (lib/trueforge.ts:
// ensureRemediationMcpServer) as a "remote" MCP server pointed at this route, with
// require_approval_for_tools covering this tool — so calling it is what makes TrueForge
// itself emit tool.approval_required and pause the turn natively (item 11). This route is
// the transport only; the actual side effect lives in lib/remediation.ts.
//
// A WebStandardStreamableHTTPServerTransport instance is scoped to exactly ONE MCP
// session, not a session router — so a fresh session (an `initialize` request with no
// `Mcp-Session-Id` header) needs a fresh McpServer+transport pair, keyed by the session id
// the transport itself generates, and looked up by that header on every later request.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { executeRemediation } from "@/lib/remediation";
import { getApproval } from "@/lib/store";
import type { ActionSpec } from "@/lib/types";

const globalKey = "__incidentAgentMcpRemediationSessions__" as const;

function getSessions(): Map<string, WebStandardStreamableHTTPServerTransport> {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: Map<string, WebStandardStreamableHTTPServerTransport>;
  };
  if (!g[globalKey]) g[globalKey] = new Map();
  return g[globalKey];
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "incident-remediation", version: "1.0.0" });

  server.registerTool(
    "execute_remediation",
    {
      title: "Execute approved incident remediation",
      description:
        "Executes the exact, already-approved remediation action for an incident. Call this " +
        "ONLY with the literal incidentId, approvalId, type, target, and params values you were " +
        "given in the prompt — never invent, infer, or alter any field. This tool call is gated " +
        "and will pause for human approval before it actually runs.",
      inputSchema: {
        incidentId: z.string(),
        approvalId: z.string(),
        type: z.enum(["rollback", "restart", "toggle_flag"]),
        target: z.string(),
        params: z.record(z.string(), z.string()),
      },
    },
    async (args) => {
      // SECURITY BOUNDARY (BOARD.tsv item 19 / CONTRACT.md rule 2): this MCP endpoint is
      // its own exposed HTTP route — nothing stops a caller from hitting it directly,
      // bypassing TrueForge's session-level tool.approval_required pause entirely.
      // TrueForge's gate is not the enforcement; this check is. Never execute a
      // caller-supplied type/target/params without re-verifying them against the exact
      // stored, approved Approval first — never trust the schema's incidentId/approvalId
      // fields as identity proof on their own.
      const approval = getApproval(args.approvalId);
      if (!approval || approval.incidentId !== args.incidentId) {
        throw new Error(
          `execute_remediation refused: no approval ${args.approvalId} found on incident ${args.incidentId}`
        );
      }
      if (approval.status !== "approved") {
        throw new Error(
          `execute_remediation refused: approval ${args.approvalId} is "${approval.status}", not "approved"`
        );
      }
      if (!actionSpecMatches(approval.actionSpec, { type: args.type, target: args.target, params: args.params })) {
        throw new Error(
          `execute_remediation refused: called action (${JSON.stringify({ type: args.type, target: args.target, params: args.params })}) ` +
            `does not exactly match the approved ActionSpec (${JSON.stringify(approval.actionSpec)})`
        );
      }

      const result = executeRemediation({ type: args.type, target: args.target, params: args.params });
      return { content: [{ type: "text", text: result }] };
    }
  );

  return server;
}

// Deep-equal check, not a subset/loose check — every field of the stored, approved
// ActionSpec must match the caller-supplied action exactly (CONTRACT.md rule 2: "execute
// only what was approved... never re-derive at execution time").
function actionSpecMatches(approved: ActionSpec, called: ActionSpec): boolean {
  if (approved.type !== called.type || approved.target !== called.target) return false;
  const approvedKeys = Object.keys(approved.params).sort();
  const calledKeys = Object.keys(called.params).sort();
  if (approvedKeys.length !== calledKeys.length) return false;
  return approvedKeys.every((k, i) => k === calledKeys[i] && approved.params[k] === called.params[k]);
}

async function createNewSession(body: unknown): Promise<WebStandardStreamableHTTPServerTransport> {
  const sessions = getSessions();
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, transport);
    },
    onsessionclosed: (sessionId) => {
      sessions.delete(sessionId);
    },
  });
  await server.connect(transport);
  void body; // body is re-parsed by handleRequest itself from the Request object
  return transport;
}

async function handle(request: Request): Promise<Response> {
  const sessions = getSessions();
  const sessionId = request.headers.get("mcp-session-id") ?? undefined;

  if (sessionId) {
    const existing = sessions.get(sessionId);
    if (existing) return existing.handleRequest(request);
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null },
      { status: 404 }
    );
  }

  // No session id: only valid as a fresh `initialize` call. Peek the body (cloned, so
  // handleRequest can still read the original request's body itself) to confirm.
  const clone = request.clone();
  let parsedBody: unknown;
  try {
    parsedBody = await clone.json();
  } catch {
    parsedBody = undefined;
  }
  if (!isInitializeRequest(parsedBody)) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Bad Request: Mcp-Session-Id header is required" }, id: null },
      { status: 400 }
    );
  }

  const transport = await createNewSession(parsedBody);
  return transport.handleRequest(request, { parsedBody });
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handle(request);
}
