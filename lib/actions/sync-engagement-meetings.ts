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
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  fetchMeetingDetail,
  searchTranscriptsByAttendee,
} from "@/lib/integrations/fireflies";

export type SyncResult =
  | { ok: true; data: { inserted: number; updated: number; skipped: number } }
  | { ok: false; error: string };

/**
 * Core Fireflies sync for one engagement — NO auth/session required, so
 * it's safe to call from the scheduled job as well as the manual button.
 * Runs under system context throughout (cross-org, RLS-bypass) since the
 * cron has no user. Idempotent (UNIQUE on engagement_id + transcript_id).
 */
async function syncMeetingsCore(engagementId: string): Promise<SyncResult> {
  // Step 1: engagement org + every email tied to it (match targets).
  const lookup = await withSystemContext(async (tx) => {
    const [eng] = await tx
      .select({ orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    if (!eng) return null;
    // Match targets = every email we know for this client. Signed-up
    // users live in user_profiles, but a client that hasn't accepted
    // their invite yet only has an email on the originating lead record —
    // so include the prospect's contact email too. Without this, a fresh
    // engagement reports "no client emails" and Fireflies can't match.
    const profiles = await tx
      .select({ email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.orgId, eng.orgId));
    const leads = await tx
      .select({ email: prospects.contactEmail })
      .from(prospects)
      .where(eq(prospects.convertedEngagementId, engagementId));
    return {
      orgId: eng.orgId,
      emails: [...profiles, ...leads]
        .map((p) => p.email)
        .filter((e): e is string => Boolean(e)),
    };
  });

  if (lookup === null) return { ok: false, error: "Engagement not found." };
  if (lookup.emails.length === 0) {
    return {
      ok: false,
      error:
        "No client email on this engagement yet. Add the client's email on " +
        "their lead/Pipeline record, then sync again.",
    };
  }
  const { orgId, emails } = lookup;

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

  return { ok: true, data: { inserted, updated, skipped } };
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
  let inserted = 0;
  let updated = 0;
  for (const { id } of ids) {
    try {
      const r = await syncMeetingsCore(id);
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
