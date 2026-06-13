"use server";

/**
 * Invite a client to their portal — the second half of the decoupled
 * onboarding. The engagement + portal already exist (activated without a
 * Clerk org); this builds the real Clerk Organization, swaps the
 * `pending:<id>` placeholder for the real org id, sends the client an
 * invitation + branded welcome email, and steps the coach back out as
 * auto-admin. Mirrors the proven flow in
 * app/business-builder/engagements/new/actions.ts.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements, orgs, prospects, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

type Result = { ok: true } | { ok: false; error: string };

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

export async function inviteClientToPortal(
  engagementId: string,
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin") {
    return { ok: false, error: "Only master admins can invite clients." };
  }

  // Load engagement + its org + the client lead (from the linked prospect)
  // + the sender's display fields.
  const ctx = await withSystemContext(async (tx) => {
    const [eng] = await tx
      .select({
        id: engagements.id,
        name: engagements.name,
        type: engagements.type,
        orgId: engagements.orgId,
        startDate: engagements.startDate,
      })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    if (!eng) return null;
    const [org] = await tx
      .select({ id: orgs.id, clerkOrgId: orgs.clerkOrgId })
      .from(orgs)
      .where(eq(orgs.id, eng.orgId))
      .limit(1);
    const [p] = await tx
      .select({
        contactEmail: prospects.contactEmail,
        contactName: prospects.contactName,
      })
      .from(prospects)
      .where(eq(prospects.convertedEngagementId, engagementId))
      .limit(1);
    const [sender] = await tx
      .select({ fullName: userProfiles.fullName, email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.id, profile.userProfileId))
      .limit(1);
    return { eng, org: org ?? null, prospect: p ?? null, sender: sender ?? null };
  });

  if (!ctx || !ctx.org) return { ok: false, error: "Engagement not found." };
  if (!ctx.org.clerkOrgId.startsWith("pending:")) {
    return { ok: false, error: "This client has already been invited." };
  }
  const clientEmail = ctx.prospect?.contactEmail;
  const clientName = ctx.prospect?.contactName ?? ctx.eng.name ?? "there";
  if (!clientEmail) {
    return {
      ok: false,
      error:
        "No contact email on this client's prospect record — add one, then invite.",
    };
  }

  const { userId: coachClerkUserId } = await auth();
  if (!coachClerkUserId) {
    return { ok: false, error: "Clerk session missing user id." };
  }

  const clerk = await clerkClient();
  const orgName = ctx.eng.name ?? "Client";

  // 1. Create the real Clerk organisation (coach auto-added as admin).
  let newClerkOrg;
  try {
    newClerkOrg = await clerk.organizations.createOrganization({
      name: orgName,
      createdBy: coachClerkUserId,
    });
  } catch (e) {
    return {
      ok: false,
      error: `Clerk org creation failed: ${clerkErrorMessage(e).slice(0, 200)}`,
    };
  }

  // 2. Swap the placeholder clerk_org_id for the real one.
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(orgs)
        .set({ clerkOrgId: newClerkOrg.id })
        .where(eq(orgs.id, ctx.org!.id));
    });
  } catch (e) {
    try {
      await clerk.organizations.deleteOrganization(newClerkOrg.id);
    } catch {
      /* best-effort cleanup */
    }
    return {
      ok: false,
      error: `Linking the org failed: ${clerkErrorMessage(e).slice(0, 200)}`,
    };
  }

  // 3. Send the invitation (coach is still admin, required by Clerk).
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://builder.4workplaces.com";
  const redirectUrl = `${appUrl.replace(/\/+$/, "")}/portal/welcome`;
  let invitationUrl: string | null = null;
  try {
    const invitation = await clerk.organizations.createOrganizationInvitation({
      organizationId: newClerkOrg.id,
      inviterUserId: coachClerkUserId,
      emailAddress: clientEmail,
      role: "org:admin",
      redirectUrl,
      publicMetadata: {
        app_role: "client_lead",
        client_lead_full_name: clientName,
      },
    });
    invitationUrl = (invitation as { url?: string | null }).url ?? null;
  } catch (e) {
    return {
      ok: false,
      error:
        `Engagement is linked, but the invitation failed: ${clerkErrorMessage(e).slice(0, 160)}. ` +
        `You can resend it from the Clerk dashboard (you're admin of that org).`,
    };
  }

  // 4. Step the coach back out as auto-admin (non-fatal).
  try {
    await clerk.organizations.deleteOrganizationMembership({
      organizationId: newClerkOrg.id,
      userId: coachClerkUserId,
    });
  } catch {
    /* coach can clean up via Clerk dashboard */
  }

  // 5. Branded welcome email (best-effort).
  if (invitationUrl && ctx.sender) {
    try {
      const { sendEmailQuietly } = await import("@/lib/email/send");
      const { engagementWelcomeEmail } = await import("@/lib/email/templates");
      await sendEmailQuietly({
        ...engagementWelcomeEmail({
          to: clientEmail,
          recipientName: clientName,
          engagementName: orgName,
          engagementType: ctx.eng.type,
          startDate: (ctx.eng.startDate ?? new Date())
            .toISOString()
            .slice(0, 10),
          acceptUrl: invitationUrl,
          senderName: ctx.sender.fullName,
          senderEmail: ctx.sender.email,
          senderTitle: "Coach · Workplaces",
        }),
        bypassWorkingHours: true,
      });
    } catch {
      /* welcome email is best-effort */
    }
  }

  revalidatePath(`/business-builder/engagements/${engagementId}`);
  return { ok: true };
}
