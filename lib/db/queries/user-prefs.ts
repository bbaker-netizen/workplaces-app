/**
 * Per-user UI preferences — pinned nav, collapsed sidebar, pipeline column
 * choices, home-dashboard layout. Backs the Phase 5 personalization pass.
 *
 * Reads run in system context because they're scoped by the caller's own
 * `user_profiles.id`, not by tenant org. Writes go through server actions
 * that bind to the caller's tenant via `withTenantContext`.
 */

import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type UserUIPrefs = {
  pinnedNavItems: string[];
  sidebarCollapsed: boolean;
  pipelineColumnPrefs: PipelineColumnPrefs | null;
  homeDashboardLayout: HomeDashboardLayout | null;
};

/** Pipeline table column preferences — what's visible, in what order, how
 *  wide, plus the per-user filter/sort selection so each Business Builder's
 *  pipeline stays how THEY left it without changing anyone else's. */
export type PipelineColumnPrefs = {
  visible: string[]; // ordered column keys, e.g. ["company","contact","email","stage"]
  widths: Record<string, number>; // px widths keyed by column key
  filters?: {
    // Stage / segment filter. Historically a single string ("prospects",
    // "all", a stage key, …); now an array of selected stage keys for
    // multi-select. Old single-string values are still read and migrated
    // on load. The sentinel ["__archived__"] means the Archived view.
    stage?: string | string[];
    source?: string; // lead-source filter value
    sort?: string; // sort key
  };
};

/** Home-dashboard layout — array of card placements. */
export type HomeDashboardCard = {
  id: string; // unique per card instance (uuid)
  type: string; // card-type key, e.g. "open_action_items"
  x: number; // grid column (0..11)
  y: number; // grid row
  w: number; // grid width in columns
  h: number; // grid height in rows
  config?: Record<string, unknown>; // card-type-specific config
};

export type HomeDashboardLayout = {
  cards: HomeDashboardCard[];
};

const EMPTY: UserUIPrefs = {
  pinnedNavItems: [],
  sidebarCollapsed: false,
  pipelineColumnPrefs: null,
  homeDashboardLayout: null,
};

/**
 * Get the current Clerk user's UI prefs, or sensible defaults if the user
 * hasn't been provisioned yet. Never throws — falls back to empty so the
 * sidebar always renders.
 */
export async function getCurrentUserPrefs(): Promise<UserUIPrefs> {
  const { userId } = await auth();
  if (!userId) return EMPTY;

  try {
    return await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({
          pinnedNavItems: userProfiles.pinnedNavItems,
          sidebarCollapsed: userProfiles.sidebarCollapsed,
          pipelineColumnPrefs: userProfiles.pipelineColumnPrefs,
          homeDashboardLayout: userProfiles.homeDashboardLayout,
        })
        .from(userProfiles)
        .where(eq(userProfiles.clerkUserId, userId))
        .limit(1);

      if (!row) return EMPTY;
      return {
        pinnedNavItems: row.pinnedNavItems ?? [],
        sidebarCollapsed: row.sidebarCollapsed ?? false,
        pipelineColumnPrefs:
          (row.pipelineColumnPrefs as PipelineColumnPrefs | null) ?? null,
        homeDashboardLayout:
          (row.homeDashboardLayout as HomeDashboardLayout | null) ?? null,
      };
    });
  } catch (e) {
    // Schema not migrated yet, transient DB error, etc. — fall back to
    // defaults so the layout still renders. Logging lets us investigate
    // without taking pages offline.
    console.error("[user-prefs] getCurrentUserPrefs failed:", e);
    return EMPTY;
  }
}
