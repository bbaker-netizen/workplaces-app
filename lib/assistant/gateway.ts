/**
 * AI Assistant gateway reader (read-only).
 *
 * Phase 1 of the assistant → portal integration. The assistant (the EA /
 * Command Central system) is the source of truth for action items. This
 * module reads its open items through the single Command Central gateway
 * webhook, server-side only, and never writes back.
 *
 * The gateway URL and secret live ONLY in server env vars
 * (EA_GATEWAY_URL, EA_GATEWAY_SECRET). They are never sent to the browser.
 * This file is imported solely by a server component and a Node route
 * handler, so the secret stays on the server.
 *
 * Contract (docs/portal-integration-brief.md):
 *   POST <EA_GATEWAY_URL>  { secret, op: "read" [, client, source, status] }
 *   -> { ok: true, items: [ { id, type, source, status, priority, due,
 *        item, client, slip, created, updated } ] }
 * The gateway returns `priority` and `slip` as strings; we coerce them to
 * numbers here so callers always get numbers. The gateway also issues a
 * 302 redirect for some clients; fetch follows it by default.
 */

export type AssistantItem = {
  id: string;
  type: string;
  source: string;
  status: string;
  priority: number; // coerced from string
  slip: number; // coerced from string
  due: string | null; // YYYY-MM-DD
  item: string;
  client: string;
  created: string | null;
  updated: string | null;
};

export type AssistantClientGroup = {
  client: string;
  items: AssistantItem[];
};

export type AssistantReadResult =
  | {
      ok: true;
      groups: AssistantClientGroup[];
      count: number;
      fetchedAt: string;
    }
  | { ok: false; error: string };

const NO_CLIENT = "No client / general";

/** Coerce the gateway's string numerics ("2", "0") to real numbers. */
function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

export type AssistantReadOptions = {
  client?: string;
  source?: string;
  status?: string;
};

/**
 * Read open action items from the assistant gateway, grouped by client.
 * Read-only: no write-back ops are ever sent. Returns a discriminated
 * result so callers can render a clean error state instead of throwing.
 */
export async function readAssistantActionItems(
  opts: AssistantReadOptions = {},
): Promise<AssistantReadResult> {
  const url = process.env.EA_GATEWAY_URL;
  const secret = process.env.EA_GATEWAY_SECRET;
  if (!url || !secret) {
    return {
      ok: false,
      error:
        "Assistant gateway not configured (EA_GATEWAY_URL / EA_GATEWAY_SECRET missing).",
    };
  }

  const body: Record<string, unknown> = { secret, op: "read" };
  if (opts.client) body.client = opts.client;
  if (opts.source) body.source = opts.source;
  if (opts.status) body.status = opts.status;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "follow", // gateway 302s for some clients
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Gateway unreachable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!res.ok) {
    return { ok: false, error: `Gateway returned HTTP ${res.status}.` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "Gateway returned a non-JSON response." };
  }

  const payload = json as { ok?: unknown; items?: unknown };
  if (!payload || payload.ok !== true || !Array.isArray(payload.items)) {
    return { ok: false, error: "Gateway response was malformed (no ok/items)." };
  }

  const items: AssistantItem[] = payload.items.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: str(r.id),
      type: str(r.type),
      source: str(r.source),
      status: str(r.status),
      priority: toNum(r.priority),
      slip: toNum(r.slip),
      due: r.due ? str(r.due) : null,
      item: str(r.item),
      client: str(r.client).trim(),
      created: r.created ? str(r.created) : null,
      updated: r.updated ? str(r.updated) : null,
    };
  });

  // Group by client.
  const map = new Map<string, AssistantItem[]>();
  for (const it of items) {
    const key = it.client || NO_CLIENT;
    const arr = map.get(key);
    if (arr) arr.push(it);
    else map.set(key, [it]);
  }

  // Within a group: soonest due first (no-due last), then higher priority
  // (lower number) first.
  const groups: AssistantClientGroup[] = Array.from(map.entries()).map(
    ([client, list]) => ({
      client,
      items: list.sort((a, b) => {
        const ad = a.due ?? "9999-12-31";
        const bd = b.due ?? "9999-12-31";
        if (ad !== bd) return ad < bd ? -1 : 1;
        return a.priority - b.priority;
      }),
    }),
  );

  // Groups: named clients alphabetical, the catch-all bucket last.
  groups.sort((a, b) => {
    if (a.client === NO_CLIENT) return 1;
    if (b.client === NO_CLIENT) return -1;
    return a.client.localeCompare(b.client);
  });

  return {
    ok: true,
    groups,
    count: items.length,
    fetchedAt: new Date().toISOString(),
  };
}
