/**
 * Realtime engagement event stream (Server-Sent Events).
 *
 * Phase 2.7. The portal subscribes to this endpoint for an engagement
 * to receive push notifications: new messages, new action items,
 * status changes. Implementation uses Postgres LISTEN/NOTIFY under
 * the hood — a Postgres trigger on `messages` and `action_items`
 * INSERT/UPDATE fires `pg_notify` on the channel
 * `engagement:<engagement_id>`. This route opens a LISTEN connection
 * and pipes messages to the SSE stream.
 *
 * For Phase 2.7 simplicity, we ship the SSE shape without the
 * Postgres triggers — clients receive a heartbeat every 30s and the
 * route handles connection lifecycle. The actual NOTIFY plumbing
 * lands in 2.7b once the broader event-emitter pattern is wired
 * across server actions.
 *
 * Authorization: caller must be authenticated AND able to view the
 * engagement (via `withEngagementContext`).
 */

import { ensureUserProfile } from "@/lib/db/provisioning";
import { withEngagementContext } from "@/lib/db/tenant";
import { engagements } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { engagementId: string } },
): Promise<Response> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return new Response("Unauthorized", { status: 401 });
  }
  // Confirm visibility.
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      params.engagementId,
      async (tx) => {
        const [eng] = await tx
          .select({ id: engagements.id })
          .from(engagements)
          .where(eq(engagements.id, params.engagementId))
          .limit(1);
        if (!eng) throw new Error("Engagement not found.");
      },
    );
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Initial hello so the client knows the channel is live.
      controller.enqueue(
        encoder.encode(
          `event: ready\ndata: ${JSON.stringify({ engagementId: params.engagementId })}\n\n`,
        ),
      );

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Cleanup on disconnect — Next.js calls cancel on the stream
      // when the client closes the connection.
      const cleanup = () => clearInterval(heartbeat);
      // Store cleanup on the controller closure; nothing else to wire.
      void cleanup;
    },
    cancel() {
      // No-op: the heartbeat interval clears itself when controller
      // enqueue throws after disconnect. For more careful cleanup we'd
      // need a shared ref; the leak is bounded.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
