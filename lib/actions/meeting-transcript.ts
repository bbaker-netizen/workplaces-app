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

import { and, eq, isNotNull } from "drizzle-orm";
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

const bulkSchema = z.object({
  engagementId: z.string().uuid(),
  shared: z.boolean(),
});

export type BulkShareResult = {
  /** Meetings whose state actually changed. */
  changed: number;
  /** Already in the requested state — counted, not re-written. */
  skipped: number;
  /**
   * Meetings that could not be released because the body could not be
   * fetched. Reported rather than swallowed: a run that quietly released
   * 28 of 32 looks identical to one that released all of them.
   */
  failed: number;
  /**
   * Meetings left untouched because this press ran out of budget — see
   * FETCH_BUDGET_MS. Non-zero means "press again to continue", and the
   * button says so. Never silently dropped.
   */
  remaining: number;
};

/**
 * How long one press may spend pulling transcript bodies from Fireflies.
 *
 * This is a synchronous server action, and Netlify kills those at ~26s
 * on this plan — the same ceiling that forced transcript drafting into a
 * background function. A transcript already cached in `transcript_text`
 * costs nothing, but an uncached one is a Fireflies round trip of a
 * second or several, and A&M alone has 31 uncached. Releasing them all
 * in one press would reliably die mid-run, and a killed server action
 * returns `undefined` to the browser — the operator would see a generic
 * failure with an unknown number actually released.
 *
 * So each press releases everything free, spends a bounded slice on
 * fetches, and REPORTS what is left rather than truncating quietly.
 */
const FETCH_BUDGET_MS = 15_000;
/** Belt to the budget's braces, in case fetches come back instantly. */
const MAX_FETCHES_PER_RUN = 12;

/**
 * Release — or take back — every transcript on one engagement.
 *
 * Bruce's ask, and the reason it isn't a weakening of the gate: release
 * was one click per meeting, so opening a client's back catalogue meant
 * 32 clicks. Nobody does that, which made "the client can read the
 * transcripts" true in the code and false in practice. This is still a
 * deliberate act by a Business Builder who may act on this client — one
 * act instead of thirty-two, not an automatic rule. Nothing here ever
 * runs on a schedule, and `transcript_shared_at` still defaults NULL, so
 * a newly synced meeting is never released by a decision taken before it
 * existed.
 *
 * Per-meeting, in a loop, on purpose. A single UPDATE ... WHERE would be
 * one statement and would break the rule that makes the single-meeting
 * path safe: a row marked shared with `transcript_text` still NULL shows
 * the client an empty transcript. Each release fetches its body first
 * and is skipped — and counted — if it can't be had.
 *
 * Un-sharing takes the opposite path deliberately: it needs no body, so
 * it is a single statement and cannot partially fail. Taking something
 * back must not be able to leave half of it published.
 */
export async function setAllTranscriptsShared(
  input: z.input<typeof bulkSchema>,
): Promise<ActionResult<BulkShareResult>> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { engagementId, shared } = parsed.data;

  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Only a Business Builder can do that." };
  }
  // Honours the per-Builder client grants, same as the single-meeting
  // path — a coach restricted to their own book cannot open another
  // coach's client's back catalogue by pasting an engagement id.
  if (!(await canCurrentBbAccessEngagement(engagementId))) {
    return { ok: false, error: "You don't have access to that client." };
  }

  if (!shared) {
    const count = await withSystemContext(async (tx) => {
      const rows = await tx
        .update(engagementMeetings)
        .set({ transcriptSharedAt: null, transcriptSharedByUserProfileId: null })
        .where(
          and(
            eq(engagementMeetings.engagementId, engagementId),
            isNotNull(engagementMeetings.transcriptSharedAt),
          ),
        )
        .returning({ id: engagementMeetings.id });
      return rows.length;
    });
    revalidatePath(`/business-builder/engagements/${engagementId}/meetings`);
    revalidatePath("/portal/meetings");
    return {
      ok: true,
      data: { changed: count, skipped: 0, failed: 0, remaining: 0 },
    };
  }

  const pending = await withSystemContext(async (tx) =>
    tx
      .select({
        id: engagementMeetings.id,
        sharedAt: engagementMeetings.transcriptSharedAt,
        // Whether the body is already cached decides whether releasing
        // this one costs a Fireflies round trip or nothing at all.
        hasText: engagementMeetings.transcriptText,
      })
      .from(engagementMeetings)
      .where(eq(engagementMeetings.engagementId, engagementId)),
  );

  let changed = 0;
  let failed = 0;
  let fetches = 0;
  let remaining = 0;
  const startedAt = Date.now();
  const skipped = pending.filter((m) => m.sharedAt !== null).length;

  // Cached bodies first, so a press always makes every free release it
  // can before spending any of its budget on the network. Otherwise a
  // run could burn the whole budget on slow fetches and leave instant
  // ones unreleased for no reason.
  const todo = pending
    .filter((m) => m.sharedAt === null)
    .sort((a, b) => Number(Boolean(b.hasText)) - Number(Boolean(a.hasText)));

  for (const m of todo) {
    const needsFetch = !m.hasText;
    if (
      needsFetch &&
      (fetches >= MAX_FETCHES_PER_RUN ||
        Date.now() - startedAt > FETCH_BUDGET_MS)
    ) {
      remaining += 1;
      continue;
    }
    if (needsFetch) fetches += 1;

    const load = await ensureTranscriptText(m.id);
    if (load.status !== "ok") {
      // Usually "this meeting has no transcript" — ordinary, not an
      // error worth aborting the whole run for. Counted so the button
      // can say so.
      failed += 1;
      continue;
    }
    await withSystemContext(async (tx) => {
      await tx
        .update(engagementMeetings)
        .set({
          transcriptSharedAt: new Date(),
          transcriptSharedByUserProfileId: profile.userProfileId,
        })
        .where(eq(engagementMeetings.id, m.id));
    });
    changed += 1;
  }

  revalidatePath(`/business-builder/engagements/${engagementId}/meetings`);
  revalidatePath("/portal/meetings");
  return { ok: true, data: { changed, skipped, failed, remaining } };
}
