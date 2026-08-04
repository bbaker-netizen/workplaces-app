/**
 * Who the portal is rendering FOR.
 *
 * Preview mode used to set a cookie and change nothing else. Every
 * /portal page still read `profile.role`, which for a previewing
 * Business Builder is master_admin — so `isCoachLike` was true, and the
 * banner reading "this is what they see" sat directly above the coach
 * view: draft action items, the Draft filter chip, the schedule form,
 * the delete buttons. Bruce read 16 unpublished machine-written drafts
 * as a client-visible leak. They were never client-visible; the preview
 * was.
 *
 * `getPortalViewer()` separates the two questions a portal page asks:
 *
 *   - WHO IS SIGNED IN — authorization. Stays `profile.*` and is what
 *     every server action re-reads for itself. Untouched by preview.
 *   - WHO IS THIS SCREEN FOR — presentation. `viewer.role` and
 *     `viewer.userProfileId`, which preview swaps for the client's.
 *
 * Preview can only ever NARROW. `client_lead` is the highest client
 * role, so previewing shows the most any client could see and never
 * less — a Business Builder checking "is this safe to expose" gets the
 * worst case, which is the only useful answer. It never widens: a
 * client role can't be turned into a coach by any cookie, because the
 * swap is applied to coach roles only.
 *
 * Writes are unaffected by design. The server actions authorize on the
 * real signed-in role, so preview hiding a control is a UI courtesy,
 * not the security boundary. The boundary is where it always was.
 */

import "server-only";
import { cookies } from "next/headers";
import { PORTAL_PREVIEW_COOKIE } from "@/lib/db/queries/engagements";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { type UserProfile } from "@/lib/db/schema";

type Role = UserProfile["role"];

/** The role preview pretends to be. See the module header. */
const PREVIEW_ROLE: Role = "client_lead";

/** Client roles in descending order of what they can see. */
const CLIENT_ROLE_PREFERENCE: ReadonlyArray<Role> = [
  "client_lead",
  "client_manager",
  "client_employee",
];

export type PortalViewer = {
  /** True when a Business Builder is previewing a client's portal. */
  isPreview: boolean;
  /** Role this SCREEN should be rendered for. Never use to authorize. */
  role: Role;
  /**
   * Profile id "your items" should be measured against. In preview this
   * is the previewed client's own profile — otherwise the dashboard
   * reports the Business Builder's workload (always zero on a client
   * engagement) under the heading "Your open items", which is what made
   * the dashboard and the action-items list disagree.
   *
   * Null when previewing an engagement nobody has been invited to yet.
   */
  userProfileId: string | null;
  /** First name for the greeting. The client's, in preview. */
  displayName: string;
  /** True when the signed-in user really is a Business Builder. */
  isBusinessBuilder: boolean;
};

function isCoachRole(role: Role): boolean {
  return role === "master_admin" || role === "coach";
}

/**
 * Resolve the viewer for a portal page.
 *
 * `engagementId` is needed only to find a client to stand in for while
 * previewing; pass it whenever the page has already resolved the
 * engagement (every module page has). Without it, preview still narrows
 * the role — it just can't personalise "your items", which then read as
 * nobody's rather than as the Business Builder's.
 */
export async function getPortalViewer(
  profile: { status: "ok"; role: Role; userProfileId: string; fullName: string },
  engagementId?: string,
): Promise<PortalViewer> {
  const isBusinessBuilder = isCoachRole(profile.role);
  const previewCookie = cookies().get(PORTAL_PREVIEW_COOKIE)?.value === "1";
  // A cookie on a client session must not change anything. Preview is a
  // Business Builder affordance and the role gate is what makes the
  // swap one-directional.
  const isPreview = previewCookie && isBusinessBuilder;

  const firstName = (full: string) => full.split(" ")[0] ?? full;

  if (!isPreview) {
    return {
      isPreview: false,
      role: profile.role,
      userProfileId: profile.userProfileId,
      displayName: firstName(profile.fullName),
      isBusinessBuilder,
    };
  }

  const standIn = engagementId ? await findStandInClient(engagementId) : null;

  return {
    isPreview: true,
    role: PREVIEW_ROLE,
    userProfileId: standIn?.id ?? null,
    displayName: standIn ? firstName(standIn.fullName) : "there",
    isBusinessBuilder,
  };
}

/**
 * The client whose shoes preview stands in. Highest client role wins so
 * the preview keeps showing the most a client could see, matching
 * PREVIEW_ROLE.
 *
 * Reuses `listEngagementMembers` rather than re-deriving the join:
 * profiles are org-scoped, not engagement-scoped, so resolving them
 * means engagement → org → profiles, and a previewing Business Builder
 * sits in the MASTER org while these rows sit in the client's. That
 * cross-org read is exactly what the existing query already handles.
 *
 * Nothing leaves this function but a first name and an id used to
 * filter rows the viewer could already read.
 */
async function findStandInClient(
  engagementId: string,
): Promise<{ id: string; fullName: string } | null> {
  try {
    const members = await listEngagementMembers(engagementId);
    for (const role of CLIENT_ROLE_PREFERENCE) {
      const match = members.find((m) => m.role === role);
      if (match) return { id: match.id, fullName: match.fullName };
    }
    return null;
  } catch {
    // A failed lookup must not take the portal down. Preview still
    // narrows the role; it just can't name anybody.
    return null;
  }
}
