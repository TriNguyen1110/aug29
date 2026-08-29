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
      const result = executeRemediation({ type: args.type, target: args.target, params: args.params });
      return { content: [{ type: "text", text: result }] };
    }
  );

  return server;
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
