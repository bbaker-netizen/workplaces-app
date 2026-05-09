/**
 * Soft-delete tombstone marker for messages.
 *
 * Lives outside the "use server" boundary because Next.js only permits
 * async function exports from server-action files. Importable from
 * actions, queries, and components without restriction.
 */

import type { Message } from "@/lib/db/schema";

/**
 * Sentinel inserted in `body` when a message is "deleted". The renderer
 * keys off this exact string to show the [Message deleted] tombstone.
 * Stored in plain text so Postgres queries don't need a special column.
 */
export const TOMBSTONE_BODY = "__BUILDER_TOMBSTONE_DELETED__";

export function isTombstone(m: Pick<Message, "body">): boolean {
  return m.body === TOMBSTONE_BODY;
}
