/**
 * EA two-way sync — push side (Stage 1).
 *
 * The EA Action Items sheet (Command Central) is Bruce's cockpit. When an
 * action item is created or changed in the Builder, we push it OUT to that
 * sheet through the Command Central gateway so it shows up where he works.
 * Status changes made in the sheet are mirrored back by a separate poll
 * (Stage 2); this file only writes outward.
 *
 * Source of truth for the row stays the sheet. We store the sheet's
 * `BB-####` id on the Builder row (`action_items.ea_external_id`) so we can
 * update the same row rather than create duplicates. The gateway also
 * dedupes by item text among Open rows, so a double-send is harmless.
 *
 * Everything here is best-effort: a gateway hiccup must never fail the
 * user's create/update. Callers swallow errors; we also catch internally.
 *
 * Gateway contract (verified live 2026-06-27):
 *   op:add    { rows:[{ item, client, due, type, source, priority }] } -> { results:[{ id }] }
 *   op:update { id, set:{ status, due } }
 * Secret + URL come from server env only (EA_GATEWAY_URL / EA_GATEWAY_SECRET).
 */

import { eq, isNotNull } from "drizzle-orm";
import { actionItems, engagements } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

type SheetStatus = "Open" | "Done" | "Expired";

/** Map a Builder action-item status to the sheet's status vocabulary.
 *  Returns null for statuses that should NOT appear on the sheet (drafts
 *  are coach-only and not yet a real commitment). */
function statusToSheet(status: string): SheetStatus | null {
  if (status === "done") return "Done";
  if (status === "open" || status === "in_progress" || status === "blocked") {
    return "Open";
  }
  return null; // draft → not pushed
}

/** Sheet wants YYYY-MM-DD in Mountain time. */
function toSheetDate(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
}

function gatewayConfig(): { url: string; secret: string } | null {
  const url = process.env.EA_GATEWAY_URL;
  const secret = process.env.EA_GATEWAY_SECRET;
  if (!url || !secret) return null;
  return { url, secret };
}

async function post(body: Record<string, unknown>): Promise<unknown> {
  const cfg = gatewayConfig();
  if (!cfg) return null;
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: cfg.secret, ...body }),
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`EA gateway HTTP ${res.status}`);
  return res.json();
}

/** Add a row to the sheet; returns the new BB-#### id (or null). */
async function eaAdd(row: {
  item: string;
  client: string;
  due?: string;
  priority?: number;
}): Promise<string | null> {
  const json = (await post({
    op: "add",
    rows: [
      {
        item: row.item,
        client: row.client,
        due: row.due,
        type: "Action",
        source: "Builder",
        priority: row.priority ?? 2,
      },
    ],
  })) as { results?: Array<{ id?: string }> } | null;
  return json?.results?.[0]?.id ?? null;
}

/** Update a sheet row by BB-#### id. */
async function eaUpdate(
  id: string,
  set: { status?: SheetStatus; due?: string },
): Promise<void> {
  await post({ op: "update", id, set });
}

/**
 * Reconcile one Builder action item with the sheet. Creates the row on
 * first push (storing the returned BB-id), updates it thereafter. Drafts
 * are skipped. Safe to call after any create/update; never throws.
 */
export async function syncActionItemToEa(itemId: string): Promise<void> {
  if (!gatewayConfig()) return;
  try {
    await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({
          id: actionItems.id,
          title: actionItems.title,
          status: actionItems.status,
          dueDate: actionItems.dueDate,
          eaExternalId: actionItems.eaExternalId,
          engagementName: engagements.name,
        })
        .from(actionItems)
        .innerJoin(engagements, eq(engagements.id, actionItems.engagementId))
        .where(eq(actionItems.id, itemId))
        .limit(1);
      if (!row) return;

      const sheetStatus = statusToSheet(row.status);
      if (sheetStatus === null) return; // draft — don't surface on the sheet

      const due = toSheetDate(row.dueDate);

      if (row.eaExternalId) {
        await eaUpdate(row.eaExternalId, { status: sheetStatus, due });
        return;
      }

      const newId = await eaAdd({
        item: row.title,
        client: row.engagementName ?? "",
        due,
      });
      if (newId) {
        await tx
          .update(actionItems)
          .set({ eaExternalId: newId })
          .where(eq(actionItems.id, itemId));
      }
    });
  } catch (e) {
    console.error("[ea-sync] syncActionItemToEa failed:", e);
  }
}

/** Mark a row Expired in the sheet (used when an item is deleted in the
 *  Builder). Never throws. */
export async function expireInEa(externalId: string | null): Promise<void> {
  if (!externalId || !gatewayConfig()) return;
  try {
    await eaUpdate(externalId, { status: "Expired" });
  } catch (e) {
    console.error("[ea-sync] expireInEa failed:", e);
  }
}


/**
 * Stage 2 — mirror sheet status changes BACK to the Builder.
 *
 * Reads every row from the EA sheet and, for each Builder action item that
 * carries an ea_external_id, brings the Builder status into line with the
 * sheet. Runs on a schedule (Netlify scheduled function -> cron route).
 *
 * Deliberately conservative so the two systems can't fight:
 *   - sheet Done  -> Builder done   (close it here when closed there)
 *   - sheet Open  -> Builder open   ONLY if the Builder copy is currently
 *     done (i.e. it was reopened in Command Central). We never overwrite a
 *     live in_progress / blocked state, since those both map to sheet Open.
 *   - sheet Expired -> left alone. Expiry is an EA-side lifecycle with no
 *     Builder equivalent; we don't auto-close or delete on a poll.
 *
 * Writes status directly (not through the action-item server action) so the
 * outbound push hook doesn't re-fire — no ping-pong. Never throws to the
 * caller in a way that breaks the cron; the route wraps it.
 */
export async function mirrorEaStatusesToBuilder(): Promise<{
  checked: number;
  updated: number;
}> {
  if (!gatewayConfig()) return { checked: 0, updated: 0 };

  const json = (await post({ op: "read", status: "all" })) as {
    items?: Array<{ id?: string; status?: string }>;
  } | null;
  const rows = json?.items ?? [];

  const sheetStatusById = new Map<string, string>();
  for (const r of rows) {
    if (r.id) sheetStatusById.set(String(r.id), String(r.status ?? "").toLowerCase());
  }

  let checked = 0;
  let updated = 0;

  await withSystemContext(async (tx) => {
    const builderRows = await tx
      .select({
        id: actionItems.id,
        status: actionItems.status,
        ext: actionItems.eaExternalId,
      })
      .from(actionItems)
      .where(isNotNull(actionItems.eaExternalId));

    for (const b of builderRows) {
      if (!b.ext) continue;
      const sheet = sheetStatusById.get(b.ext);
      if (!sheet) continue;
      checked++;

      let next: "open" | "done" | null = null;
      if (sheet === "done" && b.status !== "done") next = "done";
      else if (sheet === "open" && b.status === "done") next = "open";

      if (next) {
        await tx
          .update(actionItems)
          .set({ status: next, updatedAt: new Date() })
          .where(eq(actionItems.id, b.id));
        updated++;
      }
    }
  });

  return { checked, updated };
}
