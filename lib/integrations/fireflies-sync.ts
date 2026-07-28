/**
 * Fireflies meetings sync — the session-free core.
 *
 * Walks every user_profile in an engagement's org, asks Fireflies for
 * transcripts that include each one as an attendee, then upserts the
 * result into engagement_meetings. Deliberately does NOT touch action
 * item extraction — that pipeline stays separate, per Bruce.
 *
 * Re-runs are idempotent (UNIQUE on engagement_id + transcript_id).
 *
 * **Why this is not in `lib/actions/`, and why it must not move there.**
 *
 * This file has no `"use server"` directive, and that is load-bearing.
 * Every export of a `"use server"` module becomes a server action — a
 * POST endpoint reachable from a browser. An unguarded, cross-tenant,
 * Fireflies-billing sync must not be one of those. So the work lives
 * here, session-free and callable by the cron, and the guarded UI
 * wrapper stays in `lib/actions/sync-engagement-meetings.ts` where the
 * Clerk check belongs.
 *
 * This split exists because the hourly cron was calling the GUARDED
 * version. `ensureUserProfile()` reads the Clerk session, a cron run has
 * none, so the guard failed and the job returned "0 engagements, 0
 * inserted" in a few milliseconds — every hour, since 24 July 2026, with
 * a clean success and no error anywhere. Nothing ever surfaced it: the
 * only symptom was session recaps that never arrived, which is
 * indistinguishable from a quiet fortnight.
 *
 * Same trap as `topUpAllSeries`, `carryForwardAgendaAsSystem`, and the
 * EA crons. **Anything a scheduled job calls must not depend on
 * `ensureUserProfile()` or on any helper built over it
 * (`withEngagementContext`, `canCurrentBbAccessEngagement`).** Use
 * `withSystemContext` and let the route's `CRON_SECRET` be the boundary.
 */

import { eq, inArray, isNull } from "drizzle-orm";
import { engagementMeetings, engagements } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  fetchMeetingDetail,
  listRecentTranscripts,
} from "@/lib/integrations/fireflies";
import {
  getEmailAttribution,
  normalizeName,
  type EmailAttribution,
} from "@/lib/sync/match-emails";

type RecentTranscript = Awaited<
  ReturnType<typeof listRecentTranscripts>
>[number];

export type SharedSyncContext = {
  attribution: EmailAttribution;
  transcripts: RecentTranscript[];
};

export type SyncResult =
  | { ok: true; data: { inserted: number; updated: number; skipped: number } }
  | { ok: false; error: string };

/**
 * Which engagement(s) a transcript belongs to. A BBS recording is titled
 * "<Client> - Business Building Session …", so the title naming the client
 * is the primary (and most reliable) signal — in-person sessions often
 * capture only the coach as an attendee. A client-unique attendee email is
 * the secondary signal. The coach's own email and any shared email are
 * never used (they'd pull every client's meetings into one).
 */
function engagementsForTranscript(
  titleNorm: string,
  attendeeEmails: string[],
  attr: EmailAttribution,
): Set<string> {
  const out = new Set<string>();
  for (const { id, norm } of attr.engagementNames) {
    if (norm.length >= 4 && titleNorm.includes(norm)) out.add(id);
  }
  for (const e of attendeeEmails) {
    const owner = attr.uniqueEmailToEngagement.get(e.toLowerCase());
    if (owner) out.add(owner);
  }
  return out;
}

/**
 * Core Fireflies sync for one engagement — NO auth/session required, so
 * it's safe to call from the scheduled job as well as the manual button.
 * Runs under system context throughout (cross-org, RLS-bypass) since the
 * cron has no user. Idempotent (UNIQUE on engagement_id + transcript_id).
 */
export async function syncMeetingsCore(
  engagementId: string,
  shared?: SharedSyncContext,
): Promise<SyncResult> {
  // Attribution (email exclusions + unique-email map + engagement names)
  // and the recent transcript list. Both are reused across engagements by
  // the cron; the manual single-engagement sync fetches them itself.
  const attr = shared?.attribution ?? (await getEmailAttribution());
  const transcripts =
    shared?.transcripts ?? (await listRecentTranscripts({ maxTotal: 1000 }));

  const eng = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ orgId: engagements.orgId, name: engagements.name })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    return row ?? null;
  });
  if (eng === null) return { ok: false, error: "Engagement not found." };
  const orgId = eng.orgId;

  // Match transcripts to THIS engagement by title (primary) or a
  // client-unique attendee email (secondary).
  const transcriptSummaries = new Map<
    string,
    { id: string; title: string; date: number; duration: number }
  >();
  for (const t of transcripts) {
    const emails = (t.meeting_attendees ?? [])
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e));
    const owners = engagementsForTranscript(
      normalizeName(t.title ?? ""),
      emails,
      attr,
    );
    if (owners.has(engagementId)) {
      transcriptSummaries.set(t.id, {
        id: t.id,
        title: t.title,
        date: t.date,
        duration: t.duration,
      });
    }
  }

  if (transcriptSummaries.size === 0) {
    // Still reconcile so any previously mis-filed rows get cleared.
    await reconcileMisfiledMeetings(engagementId, attr);
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
            durationMin:
              detail!.duration != null ? Math.round(detail!.duration) : null,
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
          durationMin:
            detail!.duration != null ? Math.round(detail!.duration) : null,
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

  // Step 4: clean up any meetings previously mis-filed under this client.
  await reconcileMisfiledMeetings(engagementId, attr);

  return { ok: true, data: { inserted, updated, skipped } };
}

/**
 * Remove meetings filed under `engagementId` that provably belong to a
 * DIFFERENT client — judged by the same title/unique-email attribution
 * used for matching. If a stored row's title names another client (or a
 * unique attendee maps elsewhere) and NOT this engagement, it's deleted.
 * Self-heals the cross-client contamination on every sync.
 */
async function reconcileMisfiledMeetings(
  engagementId: string,
  attr: EmailAttribution,
): Promise<number> {
  const rows = await withSystemContext(async (tx) =>
    tx
      .select({
        id: engagementMeetings.id,
        title: engagementMeetings.title,
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
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e));
    const owners = engagementsForTranscript(
      normalizeName(row.title ?? ""),
      emails,
      attr,
    );
    // Belongs here → keep. Can't attribute at all → keep (don't guess).
    // Attributable, but to someone else only → delete.
    if (owners.has(engagementId) || owners.size === 0) continue;
    toDelete.push(row.id);
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

/**
 * Sync Fireflies meetings for EVERY active engagement, with no session
 * required. This is what the hourly cron calls, and the only caller that
 * should: the route's `CRON_SECRET` is the boundary, not a Clerk check
 * that cannot pass in a scheduled run.
 *
 * One engagement failing doesn't stop the others.
 */
export async function syncAllEngagementMeetingsAsSystem(): Promise<{
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
  // Compute attribution + fetch the recent transcript list ONCE and reuse
  // across all engagements — efficient and a single consistent snapshot.
  const shared: SharedSyncContext = {
    attribution: await getEmailAttribution(),
    transcripts: await listRecentTranscripts({ maxTotal: 1000 }),
  };
  let inserted = 0;
  let updated = 0;
  for (const { id } of ids) {
    try {
      const r = await syncMeetingsCore(id, shared);
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
