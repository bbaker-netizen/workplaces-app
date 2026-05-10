/**
 * Portal module registry.
 *
 * Phase 3.1. The 16 modules CLAUDE.md spells out as the default
 * library. Each entry knows: its enum key, a label, the portal
 * URL, and what role can see it. The PortalNav filters this list
 * via `getEnabledModules(engagementId)`.
 *
 * Default behaviour: everything enabled. Adding a row to
 * `portal_module_assignments` with is_enabled=false hides it.
 */

import { eq } from "drizzle-orm";
import { portalModuleAssignments } from "@/lib/db/schema";
import { withEngagementContext } from "@/lib/db/tenant";
import type { UserProfile } from "@/lib/db/schema";

export type PortalModuleKey =
  | "action_items"
  | "goals"
  | "projects"
  | "sessions"
  | "soul_file"
  | "deliverables"
  | "communication"
  | "documents"
  | "courses"
  | "forms"
  | "team"
  | "invoices"
  | "methodology"
  | "embedded_apps"
  | "subscriptions"
  | "hiring";

export type PortalModule = {
  key: PortalModuleKey;
  label: string;
  href: string;
  /** Roles that can SEE the link. Action gating happens module-side. */
  visibleTo: ReadonlyArray<UserProfile["role"]>;
  /** Default sort order. */
  sortOrder: number;
};

const ALL_ROLES: ReadonlyArray<UserProfile["role"]> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
  "client_employee",
  "prospect",
];

const LEADERSHIP: ReadonlyArray<UserProfile["role"]> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];

export const ALL_MODULES: ReadonlyArray<PortalModule> = [
  { key: "action_items", label: "Action items", href: "/portal/action-items", visibleTo: ALL_ROLES, sortOrder: 0 },
  { key: "goals", label: "Goals", href: "/portal/goals", visibleTo: ALL_ROLES, sortOrder: 10 },
  { key: "projects", label: "Projects", href: "/portal/projects", visibleTo: ALL_ROLES, sortOrder: 20 },
  { key: "sessions", label: "Sessions", href: "/portal/sessions", visibleTo: ALL_ROLES, sortOrder: 30 },
  { key: "deliverables", label: "Deliverables", href: "/portal/deliverables", visibleTo: ALL_ROLES, sortOrder: 40 },
  { key: "hiring", label: "Hiring", href: "/portal/hiring", visibleTo: LEADERSHIP, sortOrder: 50 },
  { key: "communication", label: "Communication", href: "/portal/communication", visibleTo: ALL_ROLES, sortOrder: 60 },
  { key: "documents", label: "Documents", href: "/portal/documents", visibleTo: ALL_ROLES, sortOrder: 70 },
  { key: "soul_file", label: "Soul File", href: "/portal/soul-file", visibleTo: ALL_ROLES, sortOrder: 80 },
  { key: "team", label: "Team", href: "/portal/team", visibleTo: ALL_ROLES, sortOrder: 90 },
  { key: "courses", label: "Courses", href: "/portal/courses", visibleTo: ALL_ROLES, sortOrder: 100 },
  { key: "forms", label: "Forms", href: "/portal/forms", visibleTo: ALL_ROLES, sortOrder: 110 },
  { key: "embedded_apps", label: "Apps", href: "/portal/apps", visibleTo: ALL_ROLES, sortOrder: 120 },
  { key: "subscriptions", label: "Subscriptions", href: "/portal/subscriptions", visibleTo: LEADERSHIP, sortOrder: 130 },
  { key: "invoices", label: "Invoices", href: "/portal/invoices", visibleTo: LEADERSHIP, sortOrder: 140 },
  { key: "methodology", label: "Methodology", href: "/portal/methodology", visibleTo: ALL_ROLES, sortOrder: 150 },
];

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
