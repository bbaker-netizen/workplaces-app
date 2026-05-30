"use server";

/**
 * Client-side teammate invitations.
 *
 * Lets a client lead invite their own teammates straight from the
 * "My Team" page — no need to go through their Business Builder. The
 * lead is the admin of their engagement's Clerk Organization (they were
 * invited with role org:admin when the engagement was created), so they
 * can issue further invitations themselves.
 *
 * The invitee's in-app role is carried in the invitation's
 * publicMetadata.app_role and read by `ensureUserProfile` on their first
 * sign-in — exactly the same mechanism the engagement-creation flow uses
 * for the lead. Clerk sends the invitation email.
 *
 * Gated to client_lead only: they're the org admin, so Clerk accepts
 * them as the inviter. Managers/employees ask the lead (or the Business
 * Builder) to add someone.
 */

import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { orgs } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

const schema = z.object({
  fullName: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["client_manager", "client_employee"], {
    message: "Pick a role",
  }),
});

export type InviteTeammateResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

/** Pull the human-readable reason out of a Clerk API error. */
function clerkErrorMessage(e: unknown): string {
  const fallback = e instanceof Error ? e.message : String(e);
  const errors = (
    e as { errors?: Array<{ longMessage?: string; message?: string }> }
  ).errors;
  if (errors && errors.length > 0) {
    return errors[0].longMessage ?? errors[0].message ?? fallback;
  }
  return fallback;
}

export async function inviteTeammate(input: {
  fullName: string;
  email: string;
  role: string;
}): Promise<InviteTeammateResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "You're not signed in." };
  }
  if (profile.role !== "client_lead") {
    return {
      ok: false,
      error:
        "Only the engagement lead can invite teammates. Ask your lead or your Business Builder to add someone.",
    };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const engagement = await getCurrentEngagement();
  if (!engagement) {
    return { ok: false, error: "We couldn't find your engagement." };
  }

  // Resolve the Clerk Organization id for this engagement's org.
  const orgRow = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ clerkOrgId: orgs.clerkOrgId })
      .from(orgs)
      .where(eq(orgs.id, engagement.orgId))
      .limit(1);
    return row ?? null;
  });
  if (!orgRow) {
    return { ok: false, error: "We couldn't find your organization." };
  }

  const { userId: inviterUserId } = await auth();
  if (!inviterUserId) {
    return { ok: false, error: "Your session is missing — try signing in again." };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://workplaces-the-builder.netlify.app";
  const redirectUrl = `${appUrl.replace(/\/+$/, "")}/portal/welcome`;

  try {
    const clerk = await clerkClient();
    await clerk.organizations.createOrganizationInvitation({
      organizationId: orgRow.clerkOrgId,
      inviterUserId,
      emailAddress: parsed.data.email,
      // org:admin is the role key proven to work on this Clerk instance
      // (the engagement-creation flow uses it). In-app permissions are
      // governed by app_role below, not the Clerk org role, so this does
      // not over-grant anything inside the portal.
      role: "org:admin",
      redirectUrl,
      publicMetadata: {
        app_role: parsed.data.role,
        invited_full_name: parsed.data.fullName,
      },
    });
    return { ok: true, email: parsed.data.email };
  } catch (e) {
    return { ok: false, error: clerkErrorMessage(e).slice(0, 200) };
  }
}
