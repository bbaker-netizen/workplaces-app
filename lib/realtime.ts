/**
 * Realtime event emission helpers.
 *
 * Phase 3.7. Server actions call `emitEngagementEvent` after a
 * meaningful state change; the SSE route listens on the matching
 * channel and forwards events to subscribed clients.
 *
 * Channel names: `engagement:<engagement_id>`. Payload is JSON with
 * shape `{ type: "message_created" | "action_item_updated" | …,
 * data: any }`. Clients react however they want (typically by calling
 * router.refresh()).
 */

import { sql } from "drizzle-orm";

export type RealtimeEventType =
  | "message_created"
  | "message_updated"
  | "message_deleted"
  | "action_item_created"
  | "action_item_updated"
  | "session_scheduled"
  | "session_updated"
  | "document_uploaded";

export async function emitEngagementEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  engagementId: string,
  type: RealtimeEventType,
  data: Record<string, unknown> = {},
): Promise<void> {
  const payload = JSON.stringify({ type, data });
  const channel = `engagement:${engagementId}`;
  // Postgres NOTIFY needs an identifier — must be quoted because our
  // channel includes characters that aren't valid for unquoted IDs.
  // pg_notify(text, text) is the safe variant.
  try {
    await tx.execute(
      sql`SELECT pg_notify(${channel}, ${payload}::text)`,
    );
  } catch (e) {
    // Non-fatal — realtime is a "nice to have" overlay; primary
    // mutation already committed.
    console.error("[realtime] pg_notify failed:", e);
  }
}
