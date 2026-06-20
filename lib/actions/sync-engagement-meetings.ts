"use server";

/**
 * Sync Fireflies meetings for an engagement.
 *
 * Walks every user_profile in the engagement's org, asks Fireflies
 * for transcripts that include each one as an attendee, then upserts
 * the result into engagement_meetings. Deliberately does NOT touch
 * action item extraction — that pipeline stays separate and manual,
 * per Bruce.
 *
 * Re-runs are idempotent (UNIQUE on engagement_id + transcript_id).
 */

import { eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  engagementMeetings,
  engagements,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  fetchMeetingDetail,
  searchTranscriptsByAttendee,
} from "@/lib/integrations/fireflies";
import {
  getEmailAttribution,
  getEngagementMatchEmails,
  type EmailAttribution,
} from "@/lib/sync/match-emails";

export type SyncResult =
  | { ok: true; data: { inserted: number; updated: number; skipped: number } }
  | { ok: false; error: string };

/**
 * Core Fireflies sync for one engagement — NO auth/session required, so
 * it's safe to call from the scheduled job as well as the manual button.
 * Runs under system context throughout (cross-org, RLS-bypass) since the
 * cron has no user. Idempotent (UNIQUE on engagement_id + transcript_id).
 */
async function syncMeetingsCore(
  engagementId: string,
  attribution?: EmailAttribution,
): Promise<SyncResult> {
  // Step 0: email attribution across all engagements. The coach attends
  // every client's meetings, and contact emails get reused, so we only
  // ever match on emails that belong to exactly ONE client — never the
  // coach's email or any email shared across engagements. Otherwise one
  // client's meetings get filed under another (the cross-client bug).
  const attr = attribution ?? (await getEmailAttribution());

  const orgRow = await withSystemContext(async (tx) => {
    const [eng] = await tx
      .select({ orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    return eng ?? null;
  });
  if (orgRow === null) return { ok: false, error: "Engagement not found." };
  const orgId = orgRow.orgId;

  const emails = await getEngagementMatchEmails(engagementId, attr.excluded);
  if (emails.length === 0) {
    // Always reconcile, even with no match emails — this is how a client
    // whose only "email" was the coach's gets its mis-filed rows cleared.
    await reconcileMisfiledMeetings(engagementId, emails, attr);
    return {
      ok: false,
      error:
        "No client-specific email on this engagement yet. Add the client's " +
        "own email on their lead/Pipeline record (not the coach's), then sync.",
    };
  }

  // Step 2: query Fireflies once per unique email; dedupe by transcript id.
  const transcriptSummaries = new Map<
    string,
    { id: string; title: string; date: number; duration: number }
  >();
  for (const email of Array.from(new Set(emails))) {
    try {
      const list = await searchTranscriptsByAttendee(email, { limit: 50 });
      for (const t of list) {
        if (!transcriptSummaries.has(t.id)) {
          transcriptSummaries.set(t.id, {
            id: t.id,
            title: t.title,
            date: t.date,
            duration: t.duration,
          });
        }
      }
    } catch (e) {
      console.error(
        `Fireflies search failed for ${email}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  if (transcriptSummaries.size === 0) {
    return { ok: true, data: { inserted: 0, updated: 0, skipped: 0 } };
  }

  // Step 3: upsert each new/stale transcript's detail + summary.
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const existing = await withSystemContext(async (tx) =>
    tx
      .select({
        id: engagementMeetings.id,
        transcriptId: engagementMeetings.firefliesTranscriptId,
        lastSyncedAt: engagementMeetings.lastSyncedAt,
      })
      .from(engagementMeetings)
      .where(
        inArray(
          engagementMeetings.firefliesTranscriptId,
          Array.from(transcriptSummaries.keys()),
        ),
      ),
  );
  const existingById = new Map(existing.map((e) => [e.transcriptId, e]));
  const refreshCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h

  for (const summary of Array.from(transcriptSummaries.values())) {
    const prior = existingById.get(summary.id);
    if (prior && prior.lastSyncedAt > refreshCutoff) {
      skipped += 1;
      continue;
    }
    let detail = null;
    try {
      detail = await fetchMeetingDetail(summary.id);
    } catch (e) {
      console.error(
        `Fireflies detail fetch failed for ${summary.id}:`,
        e instanceof Error ? e.message : e,
      );
      continue;
    }
    if (!detail) continue;

    const attendees = (detail.meeting_attendees ?? []).map((a) => ({
      email: a.email ?? null,
      name: a.displayName ?? null,
    }));

    await withSystemContext(async (tx) => {
      if (prior) {
        await tx
          .update(engagementMeetings)
          .set({
            title: detail!.title,
            occurredAt: new Date(detail!.date),
            durationMin: detail!.duration ?? null,
            organizerEmail: detail!.organizer_email ?? null,
            attendees,
            summaryOverview: detail!.summary?.overview ?? null,
            summaryBullets: detail!.summary?.shorthand_bullet ?? null,
            summaryKeywords: detail!.summary?.keywords?.join(", ") ?? null,
            transcriptUrl: detail!.transcript_url ?? null,
            lastSyncedAt: new Date(),
          })
          .where(eq(engagementMeetings.id, prior.id));
        updated += 1;
      } else {
        await tx.insert(engagementMeetings).values({
          orgId,
          engagementId,
          firefliesTranscriptId: detail!.id,
          title: detail!.title,
          occurredAt: new Date(detail!.date),
          durationMin: detail!.duration ?? null,
          organizerEmail: detail!.organizer_email ?? null,
          attendees,
          summaryOverview: detail!.summary?.overview ?? null,
          summaryBullets: detail!.summary?.shorthand_bullet ?? null,
          summaryKeywords: detail!.summary?.keywords?.join(", ") ?? null,
          transcriptUrl: detail!.transcript_url ?? null,
        });
        inserted += 1;
      }
    });
  }

  // Step 4: clean up any meetings previously mis-filed under this client
  // (e.g. another client's call that matched on the coach's shared email).
  await reconcileMisfiledMeetings(engagementId, emails, attr);

  return { ok: true, data: { inserted, updated, skipped } };
}

/**
 * Remove meetings filed under `engagementId` that provably belong to a
 * DIFFERENT client — i.e. a stored attendee email uniquely identifies
 * another engagement, and none of this engagement's own match emails are
 * present. Self-heals the cross-client contamination on every sync.
 */
async function reconcileMisfiledMeetings(
  engagementId: string,
  matchEmails: string[],
  attr: EmailAttribution,
): Promise<number> {
  const mine = new Set(matchEmails.map((e) => e.toLowerCase()));
  const rows = await withSystemContext(async (tx) =>
    tx
      .select({
        id: engagementMeetings.id,
        attendees: engagementMeetings.attendees,
      })
      .from(engagementMeetings)
      .where(eq(engagementMeetings.engagementId, engagementId)),
  );

  const toDelete: string[] = [];
  for (const row of rows) {
    const attendees = Array.isArray(row.attendees)
      ? (row.attendees as Array<{ email: string | null }>)
      : [];
    const emails = attendees
      .map((a) => a.email?.toLowerCase())
      .filter((e): e is string => Boolean(e));
    if (emails.length === 0) continue; // can't judge — leave it
    const belongsToMe = emails.some((e) => mine.has(e));
    if (belongsToMe) continue;
    // Only delete if a stored attendee UNIQUELY belongs to another
    // engagement — a positive "this is someone else's" signal, not just
    // "no overlap" (which could be a sparse attendee list).
    const belongsElsewhere = emails.some((e) => {
      const owner = attr.uniqueEmailToEngagement.get(e);
      return owner && owner !== engagementId;
    });
    if (belongsElsewhere) toDelete.push(row.id);
  }

  if (toDelete.length > 0) {
    await withSystemContext(async (tx) =>
      tx
        .delete(engagementMeetings)
        .where(inArray(engagementMeetings.id, toDelete)),
    );
    console.warn(
      `[fireflies-sync] removed ${toDelete.length} mis-filed meeting(s) from engagement ${engagementId}`,
    );
  }
  return toDelete.length;
}

export async function syncEngagementMeetings(
  engagementId: string,
): Promise<SyncResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const result = await syncMeetingsCore(engagementId);
  revalidatePath(`/business-builder/engagements/${engagementId}`);
  revalidatePath(`/business-builder/engagements/${engagementId}/meetings`);
  revalidatePath("/portal/meetings");
  return result;
}

/**
 * Sync Fireflies meetings for EVERY active engagement. Used by the
 * scheduled cron so each client's meeting notes populate automatically.
 * One engagement failing doesn't stop the others.
 */
export async function syncAllEngagementMeetings(): Promise<{
  engagements: number;
  inserted: number;
  updated: number;
}> {
  const ids = await withSystemContext(async (tx) =>
    tx
      .select({ id: engagements.id })
      .from(engagements)
      .where(isNull(engagements.archivedAt)),
  );
  // Compute attribution once and reuse across all engagements — both for
  // efficiency and so every engagement matches against the same snapshot.
  const attribution = await getEmailAttribution();
  let inserted = 0;
  let updated = 0;
  for (const { id } of ids) {
    try {
      const r = await syncMeetingsCore(id, attribution);
      if (r.ok) {
        inserted += r.data.inserted;
        updated += r.data.updated;
      }
    } catch (e) {
      console.error("[fireflies-sync] engagement", id, "failed:", e);
    }
  }
  return { engagements: ids.length, inserted, updated };
}
