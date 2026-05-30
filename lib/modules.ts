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
  | "calendar"
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

/**
 * Engagement-lifecycle phase a module sits inside. The sidebar nav
 * groups modules visually under these phase headers so the navigation
 * itself reads as a flow from beginning (Today) to end (Billing).
 */
export type PortalPhase =
  | "today"        // What you do this week
  | "conversations" // How we talk
  | "files"        // Where things live
  | "plan"         // The plan being built
  | "people"       // Who's on the team
  | "billing";     // Money in and out

export type PortalModule = {
  key: PortalModuleKey;
  label: string;
  href: string;
  /** Roles that can SEE the link. Action gating happens module-side. */
  visibleTo: ReadonlyArray<UserProfile["role"]>;
  /** Default sort order. */
  sortOrder: number;
  /** Engagement-lifecycle phase the sidebar groups this module under. */
  phase: PortalPhase;
};

/**
 * Phase headers + a one-line caption — shown in the sidebar as the
 * section dividers. Order here is the visual top-to-bottom flow of
 * an engagement week.
 */
export const PORTAL_PHASES: ReadonlyArray<{
  key: PortalPhase;
  label: string;
  caption: string;
}> = [
  { key: "today",         label: "Today",         caption: "What's on the plate" },
  { key: "conversations", label: "Conversations", caption: "Stay in touch between sessions" },
  { key: "files",         label: "Files",         caption: "Every document for this engagement" },
  { key: "plan",          label: "The plan",      caption: "Projects, deliverables, methodology" },
  { key: "people",        label: "People",        caption: "Team and assessments" },
  { key: "billing",       label: "Billing",       caption: "Invoices and subscription assets" },
];

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
  // Today — the week-by-week rhythm.
  { key: "action_items", label: "Action items", href: "/portal/action-items", visibleTo: ALL_ROLES, sortOrder: 0,  phase: "today" },
  { key: "calendar",     label: "Calendar",     href: "/portal/calendar",     visibleTo: ALL_ROLES, sortOrder: 5,  phase: "today" },
  { key: "sessions",     label: "Sessions",     href: "/portal/sessions",     visibleTo: ALL_ROLES, sortOrder: 10, phase: "today" },

  // Conversations.
  { key: "communication", label: "Communication", href: "/portal/communication", visibleTo: ALL_ROLES, sortOrder: 20, phase: "conversations" },

  // Files.
  { key: "documents", label: "Documents", href: "/portal/documents", visibleTo: ALL_ROLES, sortOrder: 30, phase: "files" },

  // The plan — methodology, deep work, soul file, growth track.
  { key: "soul_file",    label: "Soul File",    href: "/portal/soul-file",    visibleTo: ALL_ROLES, sortOrder: 40, phase: "plan" },
  // Goals removed per Bruce — redundant with Projects in practice.
  { key: "projects",     label: "Projects",     href: "/portal/projects",     visibleTo: ALL_ROLES, sortOrder: 60, phase: "plan" },
  { key: "deliverables", label: "Deliverables", href: "/portal/deliverables", visibleTo: ALL_ROLES, sortOrder: 70, phase: "plan" },
  { key: "methodology",  label: "Methodology",  href: "/portal/methodology",  visibleTo: ALL_ROLES, sortOrder: 80, phase: "plan" },
  { key: "courses",      label: "Courses",      href: "/portal/courses",      visibleTo: ALL_ROLES, sortOrder: 90, phase: "plan" },
  { key: "forms",        label: "Forms",        href: "/portal/forms",        visibleTo: ALL_ROLES, sortOrder: 100, phase: "plan" },

  // People.
  { key: "team",   label: "Team",   href: "/portal/team",   visibleTo: ALL_ROLES, sortOrder: 110, phase: "people" },
  { key: "hiring", label: "Hiring", href: "/portal/hiring", visibleTo: LEADERSHIP, sortOrder: 120, phase: "people" },

  // Billing.
  { key: "invoices",      label: "Invoices",      href: "/portal/invoices",      visibleTo: LEADERSHIP, sortOrder: 130, phase: "billing" },
  { key: "subscriptions", label: "Subscriptions", href: "/portal/subscriptions", visibleTo: LEADERSHIP, sortOrder: 140, phase: "billing" },

  // Plan (continued — embedded apps).
  { key: "embedded_apps", label: "Apps", href: "/portal/apps", visibleTo: ALL_ROLES, sortOrder: 150, phase: "plan" },
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
