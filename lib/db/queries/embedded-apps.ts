import { and, eq } from "drizzle-orm";
import { embeddedApps, type EmbeddedApp } from "../schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "../tenant";
import { ensureUserProfile } from "../provisioning";

export async function listEngagementEmbeddedApps(
  engagementId: string,
  visibleOnly = false,
): Promise<EmbeddedApp[]> {
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
          .from(embeddedApps)
          .where(
            visibleOnly
              ? and(
                  eq(embeddedApps.engagementId, engagementId),
                  eq(embeddedApps.isVisible, true),
                )
              : eq(embeddedApps.engagementId, engagementId),
          ),
    );
  } catch {
    return [];
  }
}

export async function getEmbeddedApp(
  id: string,
): Promise<EmbeddedApp | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  const engagementId = await resolveEngagementIdFromRecord(
    "embedded_apps",
    id,
  );
  if (!engagementId) return null;
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(embeddedApps)
          .where(eq(embeddedApps.id, id))
          .limit(1);
        return row ?? null;
      },
    );
  } catch {
    return null;
  }
}
