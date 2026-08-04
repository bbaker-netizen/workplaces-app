/**
 * Which Business Builders should hear about something a client did.
 *
 * Two things make this its own module rather than an inline query.
 *
 * **Business Builders are not in the client's org.** They live in the
 * master org, so any read bound to the engagement's tenant — which is
 * what `withEngagementContext` binds when a client writes — matches none
 * of them. `lib/actions/messages.ts` has exactly this shape and reads
 * `userProfiles` under the bound org, which is why a client posting a
 * message notifies their own colleagues and nobody on our side. This
 * resolves under `withSystemContext` instead.
 *
 * **The engagement's own coach comes first.** Notifying every Business
 * Builder about every client is how own-book-by-default gets undone one
 * notification at a time: Jen does not want a bell for Bruce's clients.
 * So it is the assigned coach, and the master admin only as a fallback
 * when the engagement has no coach — better a notification that lands on
 * the wrong desk than one that lands nowhere.
 */

import { eq } from "drizzle-orm";
import { coaches, engagements, userProfiles } from "@/lib/db/schema";
import { withSystemContext, type Tx } from "@/lib/db/tenant";

export type BuilderRecipient = {
  userProfileId: string;
  /** The Builder's OWN org (master). Notification rows must carry this,
   *  not the client's org, or the bell — which reads under the signed-in
   *  user's tenant — will never see them. */
  orgId: string;
  fullName: string;
  email: string;
};

/**
 * Resolve inside a caller-supplied transaction. Takes a `Tx` so a caller
 * already inside `withSystemContext` doesn't open a second connection.
 */
export async function resolveEngagementBuilders(
  tx: Tx,
  engagementId: string,
): Promise<BuilderRecipient[]> {
  const [eng] = await tx
    .select({ coachId: engagements.coachId })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!eng) return [];

  if (eng.coachId) {
    const rows = await tx
      .select({
        userProfileId: userProfiles.id,
        orgId: userProfiles.orgId,
        fullName: userProfiles.fullName,
        email: userProfiles.email,
        eaNotifyEmail: userProfiles.eaNotifyEmail,
      })
      .from(coaches)
      .innerJoin(userProfiles, eq(userProfiles.id, coaches.userProfileId))
      .where(eq(coaches.id, eng.coachId))
      .limit(1);
    const resolved = rows.map(toRecipient).filter(hasEmail);
    if (resolved.length > 0) return resolved;
  }

  // No coach on the engagement, or the coach row has gone missing.
  // Fall back to the master admins so the signal still reaches a person.
  const admins = await tx
    .select({
      userProfileId: userProfiles.id,
      orgId: userProfiles.orgId,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
      eaNotifyEmail: userProfiles.eaNotifyEmail,
    })
    .from(userProfiles)
    .where(eq(userProfiles.role, "master_admin"));
  return admins.map(toRecipient).filter(hasEmail);
}

/** Same, opening its own system-context transaction. */
export async function listEngagementBuilders(
  engagementId: string,
): Promise<BuilderRecipient[]> {
  return withSystemContext((tx) => resolveEngagementBuilders(tx, engagementId));
}

/**
 * Who hears about this engagement's AGENDA.
 *
 * Differs from `resolveEngagementBuilders` in exactly one case, and it is
 * the case the agenda feature exists for. The internal workspace has a
 * `coach_id` like any other engagement — `ensureInternalEngagementId`
 * sets it to whichever active coach it found, because the column is NOT
 * NULL — so resolving it the normal way would return ONE Builder and
 * quietly drop the other. On the practice's own touch-base both Business
 * Builders are participants, not a coach and a client, and the whole
 * point of finalizing is to prompt the other person.
 *
 * Everywhere else the own-book rule stands: a client engagement's agenda
 * is the assigned coach's business, not the whole practice's.
 */
export async function resolveAgendaAudience(
  tx: Tx,
  engagementId: string,
): Promise<BuilderRecipient[]> {
  const [eng] = await tx
    .select({ isInternal: engagements.isInternal, orgId: engagements.orgId })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!eng) return [];

  if (!eng.isInternal) return resolveEngagementBuilders(tx, engagementId);

  const rows = await tx
    .select({
      userProfileId: userProfiles.id,
      orgId: userProfiles.orgId,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
      eaNotifyEmail: userProfiles.eaNotifyEmail,
      role: userProfiles.role,
    })
    .from(userProfiles)
    .where(eq(userProfiles.orgId, eng.orgId));

  const builders = rows
    .filter((r) => r.role === "master_admin" || r.role === "coach")
    .map(toRecipient)
    .filter(hasEmail);

  // An internal workspace with no readable Builder shouldn't fall silent
  // — drop back to the ordinary resolution rather than notifying nobody.
  return builders.length > 0
    ? builders
    : resolveEngagementBuilders(tx, engagementId);
}

type Row = {
  userProfileId: string;
  orgId: string;
  fullName: string;
  email: string | null;
  eaNotifyEmail: string | null;
};

function toRecipient(r: Row): BuilderRecipient {
  return {
    userProfileId: r.userProfileId,
    orgId: r.orgId,
    fullName: r.fullName,
    // Same rule as the EA recipients: the address they actually watch
    // wins over the sign-in address.
    email: (r.eaNotifyEmail?.trim() || r.email || "").trim(),
  };
}

function hasEmail(r: BuilderRecipient): boolean {
  return r.email.includes("@");
}
