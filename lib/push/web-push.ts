/**
 * Web Push sender.
 *
 * Sends a browser/desktop notification to every device a user has enabled
 * push on. Configured lazily from the VAPID env vars — if they're absent
 * (e.g. not set in a given environment yet) sends are a no-op rather than
 * an error, so the rest of the notification flow is never blocked.
 *
 * Reads/prunes subscriptions with `withSystemContext` because push is sent
 * from contexts that aren't the recipient's own session (crons, webhooks,
 * a coach acting in a client org).
 */

import webpush from "web-push";
import { eq } from "drizzle-orm";
import { pushSubscriptions } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:notifications@4workplaces.com";
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (e) {
    console.error("[web-push] failed to configure VAPID:", e);
    configured = false;
  }
  return configured;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Where clicking the notification should take the user. */
  url?: string;
  /** Coalescing tag — a newer push with the same tag replaces the old one. */
  tag?: string;
};

/**
 * Send a push to every device the given user has enabled. Best-effort:
 * swallows errors per-subscription and prunes endpoints the push service
 * reports as gone (404/410). Safe to call even when VAPID isn't configured.
 */
export async function sendPushToUser(
  userProfileId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await withSystemContext((tx) =>
    tx
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userProfileId, userProfileId)),
  );
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          dead.push(s.endpoint);
        } else {
          console.error("[web-push] send failed:", status ?? e);
        }
      }
    }),
  );

  if (dead.length > 0) {
    await withSystemContext(async (tx) => {
      for (const endpoint of dead) {
        await tx
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, endpoint));
      }
    });
  }
}
