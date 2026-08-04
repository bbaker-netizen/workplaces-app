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
