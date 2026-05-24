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

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  engagementMeetings,
  engagements,
  userProfiles,
} from "@/lib/db/schema";
import {
  withEngagementContext,
  withSystemContext,
} from "@/lib/db/tenant";
import {
  fetchMeetingDetail,
  searchTranscriptsByAttendee,
} from "@/lib/integrations/fireflies";

export type SyncResult =
  | { ok: true; data: { inserted: number; updated: number; skipped: number } }
  | { ok: false; error: string };

export async function syncEngagementMeetings(
  engagementId: string,
): Promise<SyncResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }

  // Step 1: confirm the engagement exists + collect every email tied
  // to its org. userProfiles in the engagement's owning org are the
  // people we'll match Fireflies transcripts against.
  const emailLookup = await withSystemContext(async (tx) => {
    const [eng] = await tx
      .select({ orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    if (!eng) return null;
    const profiles = await tx
      .select({ email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.orgId, eng.orgId));
    return profiles
      .map((p) => p.email)
      .filter((e): e is string => Boolean(e));
  });

  if (emailLookup === null) {
    return { ok: false, error: "Engagement not found." };
  }
  const emails = emailLookup;

  if (emails.length === 0) {
    return { ok: false, error: "No client emails on this engagement yet." };
  }

  // Step 2: query Fireflies once per unique email and dedupe by
  // transcript id.
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
      // Fireflies search errors on one email shouldn't abort the
      // whole sync — log and continue.
      console.error(
        `Fireflies search failed for ${email}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  if (transcriptSummaries.size === 0) {
    return {
      ok: true,
      data: { inserted: 0, updated: 0, skipped: 0 },
    };
  }

  // Step 3: for each new/unsynced transcript, fetch the detail with
  // summary and upsert.
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // Pull existing transcript ids in one query so we know which need
  // a detail fetch (new) vs which already exist (skip if synced
  // recently, otherwise refresh summary).
  const existing = await withEngagementContext(
    profile.orgId,
    profile.role,
    engagementId,
    async (tx) =>
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

    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
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
              summaryKeywords:
                detail!.summary?.keywords?.join(", ") ?? null,
              transcriptUrl: detail!.transcript_url ?? null,
              lastSyncedAt: new Date(),
            })
            .where(eq(engagementMeetings.id, prior.id));
          updated += 1;
        } else {
          await tx.insert(engagementMeetings).values({
            orgId: boundOrgId,
            engagementId,
            firefliesTranscriptId: detail!.id,
            title: detail!.title,
            occurredAt: new Date(detail!.date),
            durationMin: detail!.duration ?? null,
            organizerEmail: detail!.organizer_email ?? null,
            attendees,
            summaryOverview: detail!.summary?.overview ?? null,
            summaryBullets: detail!.summary?.shorthand_bullet ?? null,
            summaryKeywords:
              detail!.summary?.keywords?.join(", ") ?? null,
            transcriptUrl: detail!.transcript_url ?? null,
          });
          inserted += 1;
        }
      },
    );
  }

  revalidatePath(`/business-builder/engagements/${engagementId}`);
  revalidatePath(`/business-builder/engagements/${engagementId}/meetings`);
  return { ok: true, data: { inserted, updated, skipped } };
}
