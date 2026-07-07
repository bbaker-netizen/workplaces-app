/**
 * Server-only portal-module helpers.
 *
 * Split out of `lib/modules.ts` so the client-safe module registry there
 * can be imported by Client Components (e.g. PortalSidebar) without
 * dragging DB/tenant code — and now, transitively, `server-only` — into
 * the client bundle.
 */

import { eq } from "drizzle-orm";
import { portalModuleAssignments } from "@/lib/db/schema";
import type { UserProfile } from "@/lib/db/schema";
import { withEngagementContext } from "@/lib/db/tenant";
import {
  ALL_MODULES,
  type PortalModule,
  type PortalModuleKey,
} from "@/lib/modules";

/**
 * Returns the list of modules visible to the viewer in this
 * engagement. Hidden = (assignment row exists with is_enabled=false)
 * OR (viewer's role isn't in `visibleTo`). Sort uses the assignment
 * row's sort_order if present, otherwise the module's default.
 */
export async function getEnabledModules(
  callerOrgId: string,
  callerRole: UserProfile["role"],
  engagementId: string,
): Promise<PortalModule[]> {
  let assignments: Array<{
    module: PortalModuleKey;
    isEnabled: boolean;
    sortOrder: number;
  }> = [];
  try {
    assignments = (await withEngagementContext(
      callerOrgId,
      callerRole,
      engagementId,
      async (tx) =>
        tx
          .select({
            module: portalModuleAssignments.module,
            isEnabled: portalModuleAssignments.isEnabled,
            sortOrder: portalModuleAssignments.sortOrder,
          })
          .from(portalModuleAssignments)
          .where(eq(portalModuleAssignments.engagementId, engagementId)),
    )) as typeof assignments;
  } catch {
    // If we can't read assignments (e.g. caller has no engagement),
    // fall through to defaults.
    assignments = [];
  }

  const overrideMap = new Map<
    PortalModuleKey,
    { isEnabled: boolean; sortOrder: number }
  >();
  for (const a of assignments) {
    overrideMap.set(a.module, {
      isEnabled: a.isEnabled,
      sortOrder: Number(a.sortOrder),
    });
  }

  return ALL_MODULES.filter((m) => {
    if (!m.visibleTo.includes(callerRole)) return false;
    const o = overrideMap.get(m.key);
    if (o && !o.isEnabled) return false;
    return true;
  })
    .map((m) => ({
      ...m,
      sortOrder: overrideMap.get(m.key)?.sortOrder ?? m.sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
