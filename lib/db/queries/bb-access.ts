/**
 * Business Builder access control — read helpers.
 *
 * A master_admin can limit other Business Builders (role `coach`) to
 * specific clients and specific console modules. Defaults preserve the
 * prior behaviour: every Business Builder keeps `all_clients_access=true`
 * and `allowed_console_modules=null` (all) until a master_admin changes
 * it. master_admin ALWAYS has full access and bypasses every check.
 *
 * Grants live in `bb_client_access`; cross-org by nature (the Business
 * Builder is in the master org, the engagement in a client org), so reads
 * run in `withSystemContext`.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  bbClientAccess,
  coaches,
  engagements,
  orgs,
  userProfiles,
} from "../schema";
import { withSystemContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type BbAccess = {
  /** True for master_admin — full access, bypasses every restriction. */
  isMasterAdmin: boolean;
  /** True for any Business Builder (master_admin or coach). */
  isBusinessBuilder: boolean;
  /** When false, the Business Builder is limited to `grantedEngagementIds`. */
  allClientsAccess: boolean;
  /** Console nav hrefs this user may use; null = all of them. */
  allowedConsoleModules: string[] | null;
  /** Explicitly-granted engagement ids (only meaningful when
   *  `allClientsAccess` is false). */
  grantedEngagementIds: string[];
};

const FULL_ACCESS: BbAccess = {
  isMasterAdmin: true,
  isBusinessBuilder: true,
  allClientsAccess: true,
  allowedConsoleModules: null,
  grantedEngagementIds: [],
};

/**
 * Resolve the current signed-in user's Business Builder access. Returns
 * full access for master_admin, and a "not a Business Builder" shape for
 * client roles (callers should not use it for client gating).
 */
export async function getCurrentBbAccess(): Promise<BbAccess> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ...FULL_ACCESS, isMasterAdmin: false, isBusinessBuilder: false };
  }
  if (profile.role === "master_admin") return FULL_ACCESS;
  if (profile.role !== "coach") {
    return { ...FULL_ACCESS, isMasterAdmin: false, isBusinessBuilder: false };
  }

  // Fail-safe: this read sits on the hot path for EVERY authenticated page
  // (console layout + getCurrentEngagement). If it ever throws — a migration
  // still landing, a transient DB error — we must not take the whole app
  // down, so the app still loads.
  //
  // It falls back to own-book, NOT to full access. A transient error must
  // never hand one Business Builder the whole practice's client list; the
  // ownership check in `canCurrentBbAccessEngagement` still grants them
  // everything they actually own, so the degraded state is "your own
  // clients", which is both safe and usable.
  const coachOwnBook: BbAccess = {
    isMasterAdmin: false,
    isBusinessBuilder: true,
    allClientsAccess: false,
    allowedConsoleModules: null,
    grantedEngagementIds: [],
  };

  try {
    return await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({
          allClientsAccess: userProfiles.allClientsAccess,
          allowedConsoleModules: userProfiles.allowedConsoleModules,
        })
        .from(userProfiles)
        .where(eq(userProfiles.id, profile.userProfileId))
        .limit(1);

      // Absent row => own-book, matching the column's new default.
      const allClientsAccess = row?.allClientsAccess ?? false;
      const allowedConsoleModules =
        (row?.allowedConsoleModules as string[] | null) ?? null;

      const grantedEngagementIds = allClientsAccess
        ? []
        : (
            await tx
              .select({ engagementId: bbClientAccess.engagementId })
              .from(bbClientAccess)
              .where(
                eq(bbClientAccess.coachUserProfileId, profile.userProfileId),
              )
          ).map((g) => g.engagementId);

      return {
        isMasterAdmin: false,
        isBusinessBuilder: true,
        allClientsAccess,
        allowedConsoleModules,
        grantedEngagementIds,
      };
    });
  } catch (e) {
    console.error(
      "[bb-access] getCurrentBbAccess read failed; falling back to own-book access",
      e,
    );
    return coachOwnBook;
  }
}

/**
 * Can the current Business Builder access this specific engagement?
 * master_admin and all-clients Business Builders: always yes. Restricted
 * ones: only when explicitly granted.
 */
export async function canCurrentBbAccessEngagement(
  engagementId: string,
): Promise<boolean> {
  const access = await getCurrentBbAccess();
  if (!access.isBusinessBuilder) return false;
  if (access.isMasterAdmin || access.allClientsAccess) return true;
  if (access.grantedEngagementIds.includes(engagementId)) return true;

  // Your own book. This is the primary route for a standard Business
  // Builder and the reason `all_clients_access` no longer needs to be on
  // for them to work: access follows `engagements.coach_id`, which is
  // already maintained when a client is assigned, so there is no second
  // list to keep in sync. Explicit `bb_client_access` grants above stay
  // available for clients shared between Builders.
  if (await ownsOrIsUnclaimed(engagementId)) return true;

  // The practice's internal workspace is not a client — per-client
  // grants don't govern it. Every Business Builder is a participant in
  // the team's own touch-bases and can be tasked by a teammate, even
  // one restricted to a subset of clients. Checked last so the common
  // path costs no extra query.
  return isInternalEngagement(engagementId);
}

/**
 * True when the calling Business Builder is the engagement's assigned coach,
 * OR when the engagement has no coach at all.
 *
 * The unclaimed half is deliberate and matches `coachScopeWhere`: an
 * engagement created without a coach must not fall out of EVERY Builder's
 * view at once, leaving work nobody can see or claim. Today there are no
 * coachless engagements, so this is defensive.
 *
 * Errors deny rather than grant — this sits behind the flag check, so a
 * failure here can only ever withhold access, never widen it.
 */
async function ownsOrIsUnclaimed(engagementId: string): Promise<boolean> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return false;
  try {
    return await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({ coachId: engagements.coachId })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      if (!row) return false;
      if (row.coachId === null) return true;
      const [mine] = await tx
        .select({ id: coaches.id })
        .from(coaches)
        .where(eq(coaches.userProfileId, profile.userProfileId))
        .limit(1);
      return Boolean(mine && mine.id === row.coachId);
    });
  } catch (e) {
    console.error("[bb-access] ownsOrIsUnclaimed read failed", e);
    return false;
  }
}

/** True when this engagement is the practice's own team workspace. */
async function isInternalEngagement(engagementId: string): Promise<boolean> {
  try {
    return await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({ isInternal: engagements.isInternal })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      return row?.isInternal ?? false;
    });
  } catch (e) {
    console.error("[bb-access] isInternalEngagement read failed", e);
    return false;
  }
}

/**
 * Every engagement explicitly SHARED with this Business Builder.
 *
 * Reads `bb_client_access` unconditionally, which is the difference
 * between this and `getCurrentBbAccess().grantedEngagementIds` — that
 * one returns [] when `all_clients_access` is true, because there it is
 * answering "what are you limited to". Here the question is different:
 * "which of the practice's clients are also YOURS to see in your own
 * book", and the answer must not depend on how broad your permissions
 * happen to be. A Builder with all-clients permission who is sharing
 * one specific client still wants that client in their default list.
 *
 * Errors return [] — a failed read must not widen anyone's book.
 */
export async function sharedEngagementIdsFor(
  userProfileId: string,
): Promise<string[]> {
  try {
    return await withSystemContext(async (tx) => {
      const rows = await tx
        .select({ engagementId: bbClientAccess.engagementId })
        .from(bbClientAccess)
        .where(eq(bbClientAccess.coachUserProfileId, userProfileId));
      return rows.map((r) => r.engagementId);
    });
  } catch (e) {
    console.error("[bb-access] sharedEngagementIdsFor read failed", e);
    return [];
  }
}

/**
 * Who a specific client is shared with, plus every Business Builder who
 * could be added. Powers the per-client Share panel.
 *
 * The engagement's assigned coach is returned separately and is never
 * "shareable" — they already have it by ownership, and offering to
 * share a client with the person who owns it is a control that can only
 * confuse. Removing an owner's access is done by reassigning the
 * client, not by un-ticking a box here.
 */
export type EngagementShareState = {
  ownerUserProfileId: string | null;
  ownerName: string | null;
  builders: Array<{
    userProfileId: string;
    fullName: string;
    email: string;
    isMasterAdmin: boolean;
    shared: boolean;
  }>;
};

export async function getEngagementShareState(
  engagementId: string,
): Promise<EngagementShareState | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  if (profile.role !== "master_admin" && profile.role !== "coach") return null;
  if (!(await canCurrentBbAccessEngagement(engagementId))) return null;

  try {
    return await withSystemContext(async (tx) => {
      const [eng] = await tx
        .select({ orgId: engagements.orgId, coachId: engagements.coachId })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      if (!eng) return null;

      let ownerUserProfileId: string | null = null;
      if (eng.coachId) {
        const [c] = await tx
          .select({ userProfileId: coaches.userProfileId })
          .from(coaches)
          .where(eq(coaches.id, eng.coachId))
          .limit(1);
        ownerUserProfileId = c?.userProfileId ?? null;
      }

      // Business Builders live in the master org, never the client's.
      const [master] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      if (!master) return null;

      const people = await tx
        .select({
          userProfileId: userProfiles.id,
          fullName: userProfiles.fullName,
          email: userProfiles.email,
          role: userProfiles.role,
        })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.orgId, master.id),
            inArray(userProfiles.role, ["master_admin", "coach"]),
          ),
        );

      const grants = new Set(
        (
          await tx
            .select({ coachUserProfileId: bbClientAccess.coachUserProfileId })
            .from(bbClientAccess)
            .where(eq(bbClientAccess.engagementId, engagementId))
        ).map((g) => g.coachUserProfileId),
      );

      const owner = people.find((p) => p.userProfileId === ownerUserProfileId);

      return {
        ownerUserProfileId,
        ownerName: owner?.fullName ?? null,
        builders: people
          .filter((p) => p.userProfileId !== ownerUserProfileId)
          .map((p) => ({
            userProfileId: p.userProfileId,
            fullName: p.fullName,
            email: p.email,
            isMasterAdmin: p.role === "master_admin",
            shared: grants.has(p.userProfileId),
          }))
          .sort((a, b) =>
            a.fullName.localeCompare(b.fullName, undefined, {
              sensitivity: "base",
            }),
          ),
      };
    });
  } catch (e) {
    console.error("[bb-access] getEngagementShareState failed", e);
    return null;
  }
}

export type BbUserAdminRow = {
  userProfileId: string;
  fullName: string;
  email: string;
  role: string;
  allClientsAccess: boolean;
  allowedConsoleModules: string[] | null;
  grantedEngagementIds: string[];
  /** Clients this Builder reaches by being the ASSIGNED COACH, not by an
   *  explicit grant. Read-only here — it follows `engagements.coach_id`, so
   *  it changes by reassigning the client, not by ticking a box. Shown
   *  because the grant list alone made a Builder's access look empty when it
   *  wasn't: ownership is the main route now, and it was invisible. */
  ownedEngagementIds: string[];
};

/**
 * For the master_admin "Team access" admin page: every Business Builder in
 * the master org with their current access settings, plus the list of
 * active clients to grant from. Returns null for non-master_admin callers.
 */
export async function listBusinessBuildersForAdmin(): Promise<{
  users: BbUserAdminRow[];
  clients: { id: string; name: string }[];
} | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok" || profile.role !== "master_admin") return null;
  const masterOrgId = profile.orgId;

  try {
    return await withSystemContext(async (tx) => {
    const users = await tx
      .select({
        userProfileId: userProfiles.id,
        fullName: userProfiles.fullName,
        email: userProfiles.email,
        role: userProfiles.role,
        allClientsAccess: userProfiles.allClientsAccess,
        allowedConsoleModules: userProfiles.allowedConsoleModules,
      })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.orgId, masterOrgId),
          inArray(userProfiles.role, ["master_admin", "coach"]),
        ),
      );

    const grants = await tx
      .select({
        coachUserProfileId: bbClientAccess.coachUserProfileId,
        engagementId: bbClientAccess.engagementId,
      })
      .from(bbClientAccess)
      .where(eq(bbClientAccess.orgId, masterOrgId));

    const byCoach = new Map<string, string[]>();
    for (const g of grants) {
      const list = byCoach.get(g.coachUserProfileId) ?? [];
      list.push(g.engagementId);
      byCoach.set(g.coachUserProfileId, list);
    }

    // Ownership-derived access: engagement -> the coach's user profile.
    const owned = await tx
      .select({
        userProfileId: coaches.userProfileId,
        engagementId: engagements.id,
      })
      .from(engagements)
      .innerJoin(coaches, eq(coaches.id, engagements.coachId))
      .where(
        and(
          isNull(engagements.archivedAt),
          eq(engagements.isInternal, false),
        ),
      );
    const ownedByUser = new Map<string, string[]>();
    for (const o of owned) {
      if (!o.userProfileId) continue;
      const list = ownedByUser.get(o.userProfileId) ?? [];
      list.push(o.engagementId);
      ownedByUser.set(o.userProfileId, list);
    }

    // Internal workspace excluded — it isn't a client, and access to it
    // is never granted per-person (see canCurrentBbAccessEngagement).
    const clients = (
      await tx
        .select({ id: engagements.id, name: engagements.name })
        .from(engagements)
        .where(
          and(
            isNull(engagements.archivedAt),
            eq(engagements.isInternal, false),
          ),
        )
    )
      .map((c) => ({ id: c.id, name: c.name ?? "Untitled client" }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );

    return {
      users: users.map((u) => ({
        userProfileId: u.userProfileId,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        allClientsAccess: u.allClientsAccess,
        allowedConsoleModules:
          (u.allowedConsoleModules as string[] | null) ?? null,
        grantedEngagementIds: byCoach.get(u.userProfileId) ?? [],
        ownedEngagementIds: ownedByUser.get(u.userProfileId) ?? [],
      })),
      clients,
    };
    });
  } catch (e) {
    console.error("[bb-access] listBusinessBuildersForAdmin failed", e);
    return null;
  }
}
