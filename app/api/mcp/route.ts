/**
 * Workplaces MCP — HTTP transport.
 *
 * POST /api/mcp — accepts an MCP JSON-RPC payload, runs it through the
 * server, returns the response. Bearer-authenticated via
 * `MCP_BEARER_TOKEN` env var; the bearer encodes the calling coach's
 * `clerk_user_id` so we can resolve their `user_profiles.id` and
 * scope tool results by `coachId`.
 *
 * Token format (simplest workable for Phase 1.20):
 *   `Bearer <MCP_BEARER_TOKEN>:<clerk_user_id>`
 *
 * The colon split is the auth contract. The shared secret confirms
 * the caller is Cowork (or another authorized client); the
 * clerk_user_id identifies which coach is making the call. Phase 2
 * upgrades this to a signed JWT.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { createMcpServer } from "@/lib/mcp/server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authenticate(req: Request): Promise<
  | { ok: true; coachUserProfileId: string }
  | { ok: false; status: number; error: string }
> {
  const expected = process.env.MCP_BEARER_TOKEN;
  if (!expected) {
    return {
      ok: false,
      status: 500,
      error: "MCP_BEARER_TOKEN not configured.",
    };
  }
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token." };
  }
  const tokenValue = auth.slice("Bearer ".length).trim();
  // Token shape: "<secret>:<clerk_user_id>"
  const sepIdx = tokenValue.indexOf(":");
  if (sepIdx === -1) {
    return { ok: false, status: 401, error: "Malformed token." };
  }
  const secret = tokenValue.slice(0, sepIdx);
  const clerkUserId = tokenValue.slice(sepIdx + 1);
  if (secret !== expected) {
    return { ok: false, status: 401, error: "Invalid token." };
  }
  if (!clerkUserId) {
    return { ok: false, status: 401, error: "Missing user id in token." };
  }
  const profileId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.clerkUserId, clerkUserId))
      .limit(1);
    return row?.id ?? null;
  });
  if (!profileId) {
    return { ok: false, status: 403, error: "Unknown user." };
  }
  return { ok: true, coachUserProfileId: profileId };
}

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );
  }

  // Build a fresh server per-request (stateless transport — the MCP
  // SDK supports this via `enableJsonResponse: true`, no persistent
  // session id required).
  const server = createMcpServer({ coachUserProfileId: auth.coachUserProfileId });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless: each request is its own session.
    enableJsonResponse: true,
  });
  await server.connect(transport);

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // The Streamable HTTP transport's `handleRequest` accepts a Node-
  // shaped req/res. Since we're inside a Next.js route handler, we
  // adapt to Web Request/Response by capturing the response in memory.
  // The transport ultimately calls res.end(JSON_RESPONSE); we capture
  // it via a minimal mock. For Phase 1.20 we use the SDK's inline
  // request handler shape.

  // Simplified inline handling: the StreamableHTTPServerTransport
  // exposes `handleRequest(req, res, parsedBody)` — but in App Router
  // we don't have Node's req/res. The SDK ships a `handleStandalone
  // Request` helper for fetch-style. As a stable workaround for 1.20,
  // we pass raw JSON-RPC through and let the server respond.
  type JsonRpcRequest = {
    jsonrpc: "2.0";
    id: number | string | null;
    method: string;
    params?: unknown;
  };
  const rpc = body as JsonRpcRequest;
  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: rpc?.id ?? null,
        error: { code: -32600, message: "Invalid Request" },
      },
      { status: 400 },
    );
  }

  // Send through the transport's internal handler. The MCP SDK's
  // server doesn't expose a direct fetch-shaped wrapper as of v1, so
  // we shim a minimal one: call the server's tool dispatch directly
  // for `tools/list` and `tools/call`. Other methods proxy through.
  try {
    if (rpc.method === "tools/list") {
      // The server registered tools via server.tool(); pull them out
      // using the SDK's registry helper.
      const tools = (
        server as unknown as {
          _tools?: Map<string, { description?: string; inputSchema?: unknown }>;
        }
      )._tools;
      const list = tools
        ? Array.from(tools.entries()).map(([name, info]) => ({
            name,
            description: info.description ?? "",
            inputSchema: info.inputSchema ?? { type: "object", properties: {} },
          }))
        : [];
      return NextResponse.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: { tools: list },
      });
    }
    if (rpc.method === "tools/call") {
      const params = rpc.params as
        | { name?: string; arguments?: Record<string, unknown> }
        | undefined;
      if (!params?.name) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id: rpc.id,
          error: { code: -32602, message: "Missing tool name." },
        });
      }
      // The SDK exposes `_toolHandlers` keyed by tool name on McpServer.
      const handler = (
        server as unknown as {
          _toolHandlers?: Map<
            string,
            (args: Record<string, unknown>) => Promise<unknown>
          >;
        }
      )._toolHandlers?.get(params.name);
      if (!handler) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id: rpc.id,
          error: { code: -32601, message: `Unknown tool ${params.name}` },
        });
      }
      const result = await handler(params.arguments ?? {});
      return NextResponse.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result,
      });
    }
    if (rpc.method === "initialize") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "workplaces-mcp", version: "1.0.0" },
        },
      });
    }
    return NextResponse.json({
      jsonrpc: "2.0",
      id: rpc.id,
      error: { code: -32601, message: `Method not found: ${rpc.method}` },
    });
  } catch (e) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: rpc.id,
        error: {
          code: -32000,
          message: e instanceof Error ? e.message : String(e),
        },
      },
      { status: 500 },
    );
  }
}
