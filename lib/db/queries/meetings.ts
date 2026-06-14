import { desc, eq } from "drizzle-orm";
import { engagementMeetings } from "../schema";
import { withEngagementContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type EngagementMeetingRow = typeof engagementMeetings.$inferSelect;

/**
 * Fireflies-synced meeting recaps for an engagement, newest first.
 * RLS-scoped via the engagement context, so clients see their own
 * engagement's recaps in the portal.
 */
export async function listEngagementMeetings(
  engagementId: string,
): Promise<EngagementMeetingRow[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) =>
        tx
          .select()
          .from(engagementMeetings)
          .where(eq(engagementMeetings.engagementId, engagementId))
          .orderBy(desc(engagementMeetings.occurredAt)),
    );
  } catch {
    return [];
  }
}
