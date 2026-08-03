"use server";

/**
 * Releasing a transcript to the client portal.
 *
 * Bruce's two decisions, together: a released transcript is visible to
 * EVERY role in the engagement — client lead, managers and employees —
 * and nothing is released until a Business Builder says so. The second
 * is what makes the first safe. A transcript carries everything said in
 * the room, so an automatic rule would have published sixteen clients'
 * back catalogue the moment this deployed.
 *
 * `transcript_shared_at` is the whole gate. NULL means internal, and the
 * portal query filters on it.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { canCurrentBbAccessEngagement } from "@/lib/db/queries/bb-access";
import { engagementMeetings } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ensureTranscriptText, type TranscriptLoad } from "@/lib/meetings/transcript";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const shareSchema = z.object({
  meetingId: z.string().uuid(),
  shared: z.boolean(),
});

/**
 * Resolve a meeting to its engagement and confirm the caller is a
 * Business Builder who may act on that client. Every export here goes
 * through this — these are browser-reachable endpoints.
 */
async function authorizeMeeting(
  meetingId: string,
): Promise<
  { ok: true; engagementId: string; userProfileId: string } | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Only a Business Builder can do that." };
  }
  const row = await withSystemContext(async (tx) => {
    const [m] = await tx
      .select({ engagementId: engagementMeetings.engagementId })
      .from(engagementMeetings)
      .where(eq(engagementMeetings.id, meetingId))
      .limit(1);
    return m ?? null;
  });
  if (!row) return { ok: false, error: "Meeting not found." };
  // Honours the per-Builder client grants — a coach restricted to their
  // own book cannot release another coach's client's transcript by
  // pasting an id.
  if (!(await canCurrentBbAccessEngagement(row.engagementId))) {
    return { ok: false, error: "You don't have access to that client." };
  }
  return {
    ok: true,
    engagementId: row.engagementId,
    userProfileId: profile.userProfileId,
  };
}

/** Load the transcript body for a Business Builder to read. */
export async function loadMeetingTranscript(
  meetingId: string,
): Promise<ActionResult<TranscriptLoad>> {
  const auth = await authorizeMeeting(meetingId);
  if (!auth.ok) return { ok: false, error: auth.error };
  return { ok: true, data: await ensureTranscriptText(meetingId) };
}

/**
 * Share this transcript with the client, or take it back.
 *
 * Sharing fetches the body first and REFUSES if it can't be had. A row
 * marked shared with `transcript_text` still NULL would show the client
 * an empty transcript page — the release must not succeed unless there
 * is something to release.
 */
export async function setTranscriptShared(
  input: z.input<typeof shareSchema>,
): Promise<ActionResult<{ shared: boolean }>> {
  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { meetingId, shared } = parsed.data;
  const auth = await authorizeMeeting(meetingId);
  if (!auth.ok) return { ok: false, error: auth.error };

  if (shared) {
    const load = await ensureTranscriptText(meetingId);
    if (load.status !== "ok") {
      return {
        ok: false,
        error: `Can't share yet — ${load.reason}`,
      };
    }
  }

  await withSystemContext(async (tx) => {
    await tx
      .update(engagementMeetings)
      .set({
        transcriptSharedAt: shared ? new Date() : null,
        transcriptSharedByUserProfileId: shared ? auth.userProfileId : null,
      })
      .where(eq(engagementMeetings.id, meetingId));
  });

  revalidatePath(`/business-builder/engagements/${auth.engagementId}/meetings`);
  revalidatePath("/portal/meetings");
  return { ok: true, data: { shared } };
}
