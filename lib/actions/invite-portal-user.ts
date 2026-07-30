"use server";

/**
 * Add another person to a client's portal, from the Business Builder side.
 *
 * The gap this closes: `inviteClientToPortal` handles exactly ONE person
 * — the lead, at the address on their lead record — and refuses to run
 * twice. After that, the only way anyone else got in was the client lead
 * inviting them from their own My Team page. So a coach could not add a
 * second person themselves, and nobody could be added at all until the
 * lead had accepted and signed in. For a client whose lead is slow to
 * accept, that is a portal with nobody in it and a coach with no way to
 * change that.
 *
 * **No `inviterUserId`.** The invite-client flow deliberately steps the
 * coach back out as admin of the client's Clerk Organization once the
 * lead is invited, so there is no coach membership to invite from. The
 * obvious workaround — re-add the coach as an admin, invite, remove
 * again — would fire `organizationMembership.created`, and our Clerk
 * webhook provisions a `user_profiles` row from that event. It would
 * plant a Business Builder profile inside the client's org on every
 * invitation. Clerk's API makes `inviterUserId` optional, so the
 * invitation is simply issued without one and the client org stays clean.
 *
 * Role is carried in `publicMetadata.app_role` and read by
 * `ensureUserProfile` on first sign-in — the same mechanism every other
 * invitation path in this app uses.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { canCurrentBbAccessEngagement } from "@/lib/db/queries/bb-access";
import { engagements, orgs } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

const schema = z.object({
  engagementId: z.string().uuid(),
  fullName: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["client_lead", "client_manager", "client_employee"], {
    message: "Pick a role",
  }),
});

export type InvitePortalUserResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

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

export async function invitePortalUser(input: {
  engagementId: string;
  fullName: string;
  email: string;
  role: string;
}): Promise<InvitePortalUserResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "You're not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Only Business Builders can invite portal users." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { engagementId, fullName, email, role } = parsed.data;

  // A restricted Builder must not be able to add people to a client they
  // were fenced out of.
  if (!(await canCurrentBbAccessEngagement(engagementId))) {
    return { ok: false, error: "You don't have access to this client." };
  }

  const ctx = await withSystemContext(async (tx) => {
    const [eng] = await tx
      .select({ id: engagements.id, name: engagements.name, orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    if (!eng) return null;
    const [org] = await tx
      .select({ clerkOrgId: orgs.clerkOrgId })
      .from(orgs)
      .where(eq(orgs.id, eng.orgId))
      .limit(1);
    return { eng, org: org ?? null };
  });

  if (!ctx || !ctx.org) return { ok: false, error: "Client not found." };

  // Until the lead is invited the org is a placeholder with no real Clerk
  // organisation behind it, so there is nothing to invite anyone into.
  if (ctx.org.clerkOrgId.startsWith("pending:")) {
    return {
      ok: false,
      error:
        "This client's portal hasn't been opened yet. Use Invite client to bring the lead in first, then add others here.",
    };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://builder.4workplaces.com";
  const redirectUrl = `${appUrl.replace(/\/+$/, "")}/portal/welcome`;

  try {
    const clerk = await clerkClient();
    await clerk.organizations.createOrganizationInvitation({
      organizationId: ctx.org.clerkOrgId,
      emailAddress: email,
      // org:admin is the role key proven to work on this Clerk instance.
      // In-app permissions come from app_role below, not from the Clerk
      // org role, so this does not over-grant anything inside the portal.
      role: "org:admin",
      redirectUrl,
      publicMetadata: {
        app_role: role,
        invited_full_name: fullName,
        // The lead invite writes this key; mirrored so a client_lead
        // invited here provisions with the same shape.
        ...(role === "client_lead" ? { client_lead_full_name: fullName } : {}),
      },
    });
  } catch (e) {
    return { ok: false, error: clerkErrorMessage(e).slice(0, 200) };
  }

  revalidatePath(`/business-builder/engagements/${engagementId}`);
  return { ok: true, email };
}
