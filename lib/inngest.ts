/**
 * Inngest client + function scaffold.
 *
 * Phase 3.9. CLAUDE.md flags Inngest as the background-jobs solution
 * (replaces Zapier/Make). For 3.9 we ship the client + a couple of
 * function templates; the actual /api/inngest endpoint mounts the
 * functions for Inngest to call back into.
 *
 * Functions ready to wire (each is a server-side handler that
 * Inngest invokes on its schedule or in response to an event):
 *
 *   - daily-due-soon-flush — already implemented as a Netlify
 *     Scheduled Function in 1.4. Optionally migrate to Inngest in
 *     a future cleanup pass.
 *   - fireflies-extract — fires when a BBS session gets a
 *     fireflies_recording_id; pulls the transcript and extracts
 *     action items in the background.
 *   - embedding-refresh — re-embeds Soul Files whose body changed
 *     more than N hours ago without a corresponding embedding
 *     update.
 *
 * Auth: INNGEST_SIGNING_KEY + INNGEST_EVENT_KEY env vars when wired
 * to Inngest cloud. For local dev, `npx inngest-cli dev` runs against
 * the same /api/inngest endpoint.
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "workplaces-the-builder",
  name: "The Builder",
});

/** Helper — emit an event Inngest can act on. Best-effort. */
export async function emitInngestEvent(
  name: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await inngest.send({ name, data });
  } catch (e) {
    console.error("[inngest] send failed:", e);
  }
}
