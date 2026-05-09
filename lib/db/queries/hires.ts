/**
 * Hires — read queries.
 */

import { eq } from "drizzle-orm";
import { hires, type Hire } from "../schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type ListedHire = Hire;

export async function listEngagementHires(
  engagementId: string,
): Promise<ListedHire[]> {
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
          .from(hires)
          .where(eq(hires.engagementId, engagementId)),
    );
  } catch {
    return [];
  }
}

export async function getHire(id: string): Promise<ListedHire | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  const engagementId = await resolveEngagementIdFromRecord("hires", id);
  if (!engagementId) return null;
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(hires)
          .where(eq(hires.id, id))
          .limit(1);
        return row ?? null;
      },
    );
  } catch {
    return null;
  }
}
