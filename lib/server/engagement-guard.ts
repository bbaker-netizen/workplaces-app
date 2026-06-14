/**
 * Server-side write guard for the read-only-when-paused portal.
 *
 * When an engagement is paused or completed, client roles can view but
 * not write. Coaches (master_admin / coach) are never blocked — they can
 * still prep during a pause. Used by the client-facing write actions
 * (messages, action items, documents) as a last line of defence behind
 * the read-only banner.
 */

import { eq } from "drizzle-orm";
import { engagements } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { isEngagementReadOnly } from "@/lib/engagement-lifecycle";

export const READ_ONLY_ERROR =
  "This engagement is paused — your portal is read-only right now. Reach out to your Business Builder to pick things back up.";

export async function clientWriteBlocked(
  role: string,
  engagementId: string,
): Promise<boolean> {
  if (role === "master_admin" || role === "coach") return false;
  const status = await withSystemContext(async (tx) => {
    const [e] = await tx
      .select({ status: engagements.status })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    return e?.status ?? null;
  });
  return isEngagementReadOnly(status);
}
