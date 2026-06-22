"use server";

/**
 * Invite an internal Business Builder (a coach) into the master org.
 *
 * Master-admin only. The invitee gets app_role=coach (a standard internal
 * user — full coaching surface, NO system settings) by default, or
 * master_admin if explicitly chosen. Role is provisioned by
 * ensureUserProfile from publicMetadata.app_role on first sign-in.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { bbInviteAccess, orgs, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

type Result = { ok: true; email: string } | { ok: false; error: string };
type RoleResult = { ok: true } | { ok: false; error: string };

const accessSchema = z.object({
  allClientsAccess: z.boolean(),
  allowedConsoleModules: z.array(z.string()).nullable(),
  grantedEngagementIds: z.array(z.string().uuid()),
});

const schema = z.object({
  fullName: z.string().min(2, "Full name is required").max(200),
  email: z.string().email("Enter a valid email").max(254),
  role: z.enum(["coach", "master_admin"]).default("coach"),
  access: accessSchema.optional(),
});

type Access = z.infer<typeof accessSchema>;

/** True when the access is an actual restriction worth storing (vs. the
 *  default "everything"). master_admin and full access store nothing. */
function isRestricted(access: Access | undefined): boolean {
  if (!access) return false;
  return !access.allClientsAccess || access.allowedConsoleModules !== null;
}

// Upsert/clear the pre-set access for an invited email (delete-then-insert,
// matching the case-insensitive unique index). Runs in system context.
async function writeInviteAccess(
  orgId: string,
  email: string,
  role: "coach" | "master_admin",
  access: Access | undefined,
): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx
      .delete(bbInviteAccess)
      .where(
        and(
          eq(bbInviteAccess.orgId, orgId),
          sql`lower(${bbInviteAccess.email}) = lower(${email})`,
        ),
      );
    if (role === "coach" && isRestricted(access) && access) {
      await tx.insert(bbInviteAccess).values({
        orgId,
        email,
        allClientsAccess: access.allClientsAccess,
        allowedConsoleModules: access.allowedConsoleModules ?? null,
        grantedEngagementIds: access.allClientsAccess
          ? []
          : access.grantedEngagementIds,
      });
    }
  });
}

export async function inviteBusinessBuilder(
  input: z.input<typeof schema>,
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin") {
    return {
      ok: false,
      error: "Only the account owner can add Business Builders.",
    };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const orgRow = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ id: orgs.id, clerkOrgId: orgs.clerkOrgId })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    return row ?? null;
  });
  if (!orgRow) return { ok: false, error: "Master org isn't configured." };

  const { userId: inviterUserId } = await auth();
  if (!inviterUserId) {
    return { ok: false, error: "Your session is missing — sign in again." };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://builder.4workplaces.com";
  const redirectUrl = `${appUrl.replace(/\/+$/, "")}/home`;

  try {
    const clerk = await clerkClient();
    await clerk.organizations.createOrganizationInvitation({
      organizationId: orgRow.clerkOrgId,
      inviterUserId,
      emailAddress: parsed.data.email,
      role: "org:admin",
      redirectUrl,
      publicMetadata: {
        app_role: parsed.data.role,
        invited_full_name: parsed.data.fullName,
      },
    });
    // Persist the pre-set access (if any) so it applies when they accept.
    await writeInviteAccess(
      orgRow.id,
      parsed.data.email,
      parsed.data.role,
      parsed.data.access,
    );
    revalidatePath("/business-builder/settings/team");
    return { ok: true, email: parsed.data.email };
  } catch (e) {
    return {
      ok: false,
      error: (e instanceof Error ? e.message : String(e)).slice(0, 200),
    };
  }
}

const setInviteAccessSchema = z.object({
  email: z.string().email().max(254),
  access: accessSchema,
});

/**
 * Edit a pending invite's pre-set access (the "Access" control on a pending
 * invitation row). Master-admin only. Stored by email; applied when they
 * accept.
 */
export async function setInviteAccess(
  input: z.input<typeof setInviteAccessSchema>,
): Promise<RoleResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin") {
    return { ok: false, error: "Only the account owner can change access." };
  }
  const parsed = setInviteAccessSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const orgId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    return row?.id ?? null;
  });
  if (!orgId) return { ok: false, error: "Master org isn't configured." };

  try {
    await writeInviteAccess(orgId, parsed.data.email, "coach", parsed.data.access);
    revalidatePath("/business-builder/settings/team");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: (e instanceof Error ? e.message : String(e)).slice(0, 200),
    };
  }
}

/**
 * Revoke an outstanding (not-yet-accepted) Clerk invitation. Master-admin
 * only. After this the invitee's sign-up link stops working and they drop
 * off the pending list.
 */
export async function revokeBusinessBuilderInvite(
  invitationId: string,
  email?: string,
): Promise<RoleResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin") {
    return { ok: false, error: "Only the account owner can revoke invites." };
  }
  if (!invitationId || typeof invitationId !== "string") {
    return { ok: false, error: "Missing invitation." };
  }

  const { userId: requestingUserId } = await auth();
  if (!requestingUserId) {
    return { ok: false, error: "Your session is missing — sign in again." };
  }

  const orgRow = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id, clerkOrgId: orgs.clerkOrgId })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    return master ?? null;
  });
  if (!orgRow) return { ok: false, error: "Master org isn't configured." };

  try {
    const clerk = await clerkClient();
    await clerk.organizations.revokeOrganizationInvitation({
      organizationId: orgRow.clerkOrgId,
      invitationId,
      requestingUserId,
    });
    // Drop any pre-set access we were holding for this email.
    if (email) {
      await withSystemContext(async (tx) => {
        await tx
          .delete(bbInviteAccess)
          .where(
            and(
              eq(bbInviteAccess.orgId, orgRow.id),
              sql`lower(${bbInviteAccess.email}) = lower(${email})`,
            ),
          );
      });
    }
    revalidatePath("/business-builder/settings/team");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: (e instanceof Error ? e.message : String(e)).slice(0, 200),
    };
  }
}

const roleSchema = z.object({
  userProfileId: z.string().uuid(),
  role: z.enum(["coach", "master_admin"]),
});

/**
 * Change an existing internal user's role between standard Business
 * Builder (coach) and master admin.
 *
 * Master-admin only. `user_profiles.role` is the live source of truth
 * for in-app permissions (read on every request); we also mirror the
 * change onto the user's Clerk org-membership publicMetadata so a future
 * re-provision stays consistent. Guards: you can't change your own role
 * (no accidental self-lockout), and you can't remove the last master
 * admin.
 */
export async function setBusinessBuilderRole(
  input: z.input<typeof roleSchema>,
): Promise<RoleResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin") {
    return {
      ok: false,
      error: "Only the account owner can change Business Builder roles.",
    };
  }

  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form.",
    };
  }
  const { userProfileId, role } = parsed.data;

  if (userProfileId === profile.userProfileId) {
    return {
      ok: false,
      error: "You can't change your own role — ask another admin.",
    };
  }

  type Outcome =
    | { ok: false; error: string }
    | { ok: true; clerkUserId: string; masterClerkOrgId: string | null };

  const outcome: Outcome = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master)
      return { ok: false, error: "Master org isn't configured." };

    const [target] = await tx
      .select({
        id: userProfiles.id,
        clerkUserId: userProfiles.clerkUserId,
        role: userProfiles.role,
      })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.id, userProfileId),
          eq(userProfiles.orgId, master.id),
        ),
      )
      .limit(1);
    if (!target)
      return { ok: false, error: "That user isn't on your team." };
    if (target.role !== "master_admin" && target.role !== "coach") {
      return { ok: false, error: "That user isn't a Business Builder." };
    }

    const [masterOrgRow] = await tx
      .select({ clerkOrgId: orgs.clerkOrgId })
      .from(orgs)
      .where(eq(orgs.id, master.id))
      .limit(1);
    const masterClerkOrgId = masterOrgRow?.clerkOrgId ?? null;

    if (target.role === role) {
      // No-op — already at the requested role.
      return { ok: true, clerkUserId: target.clerkUserId, masterClerkOrgId };
    }

    // Don't allow demoting the last master admin.
    if (target.role === "master_admin" && role === "coach") {
      const admins = await tx
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.orgId, master.id),
            eq(userProfiles.role, "master_admin"),
          ),
        );
      if (admins.length <= 1) {
        return {
          ok: false,
          error: "You need at least one master admin on the account.",
        };
      }
    }

    await tx
      .update(userProfiles)
      .set({ role })
      .where(eq(userProfiles.id, userProfileId));

    return { ok: true, clerkUserId: target.clerkUserId, masterClerkOrgId };
  });

  if (!outcome.ok) return { ok: false, error: outcome.error };

  // Best-effort mirror onto the Clerk membership metadata. A failure here
  // doesn't undo the DB change (which is the source of truth) — log and
  // move on so the role change still takes effect.
  if (outcome.masterClerkOrgId) {
    try {
      const clerk = await clerkClient();
      await clerk.organizations.updateOrganizationMembershipMetadata({
        organizationId: outcome.masterClerkOrgId,
        userId: outcome.clerkUserId,
        publicMetadata: { app_role: role },
      });
    } catch (e) {
      console.error(
        "[setBusinessBuilderRole] Clerk metadata mirror failed:",
        e,
      );
    }
  }

  revalidatePath("/business-builder/settings/team");
  return { ok: true };
}
