/**
 * Communication — thread audience model.
 *
 * Phase 1.3 distinguishes "leadership-only" threads from
 * "everyone-in-the-engagement" threads. The split exists in code from
 * day one so the moment Bruce invites a client manager or employee
 * (Phase 2+), private leadership conversations stay private without a
 * scramble retrofit.
 *
 * For Impactica today (Bruce + client lead only), both audiences resolve
 * to the same set of people — the wall just has nobody to keep out yet.
 *
 * Three thread types in 1.3:
 *   - "engagement_leadership" — master_admin / coach / client_lead /
 *     client_manager only. Hidden from client_employee.
 *   - "engagement_team"       — everyone in the engagement (incl.
 *     client_employee).
 *   - "action_item"           — everyone in the engagement. Per-item
 *     audience flag deferred to Phase 2 once team members are routine.
 *
 * The split is enforced at the application layer: queries filter by
 * audience before returning, and server actions reject posts to threads
 * the caller can't see. RLS still binds at the org boundary; this is a
 * within-tenant role gate, not a tenant boundary.
 */

import type { UserProfile } from "@/lib/db/schema";

export type Role = UserProfile["role"];

/**
 * Stable string discriminators stored in `messages.parent_entity_type`.
 * Application-layer enum — DB column is plain text on purpose so adding
 * a new entity type (deliverable, project, hire) needs no migration.
 */
export const THREAD_TYPE = {
  engagementLeadership: "engagement_leadership",
  engagementTeam: "engagement_team",
  actionItem: "action_item",
} as const;

export type ThreadType =
  (typeof THREAD_TYPE)[keyof typeof THREAD_TYPE];

const ALL_THREAD_TYPES: ReadonlyArray<string> = Object.values(THREAD_TYPE);

export function isKnownThreadType(s: unknown): s is ThreadType {
  return typeof s === "string" && ALL_THREAD_TYPES.includes(s);
}

/** Roles allowed in the leadership-only audience. */
const LEADERSHIP_ROLES: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];

/**
 * Can the caller view the given thread?
 *
 *   - engagement_leadership: leadership roles only
 *   - engagement_team: everyone in the engagement
 *   - action_item: everyone in the engagement (Phase 1.3 default)
 */
export function canViewThread(
  threadType: string,
  role: Role,
): boolean {
  if (threadType === THREAD_TYPE.engagementLeadership) {
    return (LEADERSHIP_ROLES as readonly string[]).includes(role);
  }
  // Team thread + per-action-item threads: visible to anyone in the
  // engagement, including client_employee.
  return true;
}

/** Posting permission mirrors view permission in Phase 1.3. */
export function canPostInThread(
  threadType: string,
  role: Role,
): boolean {
  return canViewThread(threadType, role);
}

/** Display label for a thread type — used in feeds and breadcrumbs. */
export function threadTypeLabel(threadType: string): string {
  switch (threadType) {
    case THREAD_TYPE.engagementLeadership:
      return "Leadership";
    case THREAD_TYPE.engagementTeam:
      return "Team";
    case THREAD_TYPE.actionItem:
      return "Action item";
    default:
      return threadType;
  }
}
