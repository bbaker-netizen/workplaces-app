"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { coaches, engagements, orgs } from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";

/**
 * Server action: create a new engagement and invite its client lead.
 *
 * Steps (order matters — see failure-mode comments below):
 *   1. Verify the caller is a master_admin (extra check on top of the
 *      coach layout role gate — defence in depth for direct API hits).
 *   2. Validate the form input (Zod).
 *   3. Ensure the caller has a `coaches` row (lazy create on first call).
 *   4. Create a Clerk Organization for the new engagement (Bruce auto-
 *      added as admin via createdBy).
 *   5. Insert orgs + engagements rows in one bootstrap transaction.
 *      On failure here, attempt to delete the orphan Clerk Org so we
 *      don't leak resources.
 *   6. Send the Clerk invitation with role=org:admin (Clerk-side) and
 *      app_role=client_lead in publicMetadata. Bruce is still admin of
 *      the org at this point — required because Clerk needs the
 *      inviterUserId to be an active org admin.
 *   7. Remove Bruce as auto-added admin so the client org starts with
 *      its real intended membership (just the invited client lead once
 *      they accept). Non-fatal if this fails.
 */

/**
 * Pull the most useful message out of a Clerk error. Clerk wraps API
 * failures in ClerkAPIResponseError where `.message` is just the HTTP
 * status text (e.g. "Bad Request"); the actual reason lives in
 * `.errors[0].longMessage`. Returns a non-Clerk error's plain message
 * unchanged.
 */
function clerkErrorMessage(e: unknown): string {
  const fallback = e instanceof Error ? e.message : String(e);
  const errors = (
    e as {
      errors?: Array<{
        longMessage?: string;
        message?: string;
        code?: string;
      }>;
    }
  ).errors;
  if (errors && errors.length > 0) {
    const first = errors[0];
    return first.longMessage ?? first.message ?? fallback;
  }
  return fallback;
}

const schema = z.object({
  engagementName: z.string().min(1, "Name is required").max(200),
  engagementType: z.enum(["accelerator", "implementer"], {
    message: "Pick a type",
  }),
  clientLeadEmail: z.string().email("Valid email required"),
  clientLeadFullName: z
    .string()
    .min(1, "Full name is required")
    .max(200),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

export type CreateEngagementState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | {
      kind: "success";
      engagementId: string;
      appOrgId: string;
      clerkOrgId: string;
      invitedEmail: string;
    };

export async function createEngagementAction(
  _prevState: CreateEngagementState,
  formData: FormData,
): Promise<CreateEngagementState> {
  // 1. Verify caller is master_admin
  const callerProfile = await ensureUserProfile();
  if (callerProfile.status !== "ok") {
    return { kind: "error", message: "Not signed in." };
  }
  if (callerProfile.role !== "master_admin") {
    return { kind: "error", message: "Only master admins can create engagements." };
  }

  // 2. Validate input
  const parsed = schema.safeParse({
    engagementName: formData.get("engagementName"),
    engagementType: formData.get("engagementType"),
    clientLeadEmail: formData.get("clientLeadEmail"),
    clientLeadFullName: formData.get("clientLeadFullName"),
    startDate: formData.get("startDate"),
  });
  if (!parsed.success) {
    return {
      kind: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const {
    engagementName,
    engagementType,
    clientLeadEmail,
    clientLeadFullName,
    startDate,
  } = parsed.data;

  // 3. Ensure Bruce has a coaches row (lazy create)
  const callerCoach = await withTenantContext(callerProfile.orgId, async (tx) => {
    const existing = await tx
      .select()
      .from(coaches)
      .where(eq(coaches.userProfileId, callerProfile.userProfileId))
      .limit(1);
    if (existing[0]) return existing[0];
    const [created] = await tx
      .insert(coaches)
      .values({
        orgId: callerProfile.orgId,
        userProfileId: callerProfile.userProfileId,
        status: "active",
      })
      .returning();
    return created;
  });

  // 4. Get Bruce's Clerk user id (we need it as createdBy and inviterUserId)
  const { userId: bruceClerkUserId } = await auth();
  if (!bruceClerkUserId) {
    return { kind: "error", message: "Clerk session missing user id." };
  }

  // 4. Create Clerk Organization for the new engagement.
  //    createdBy auto-adds Bruce as admin; we keep him there until step 7
  //    because step 6 (invitation) requires inviterUserId to be an active
  //    admin member of the org.
  const clerk = await clerkClient();
  let newClerkOrg;
  try {
    newClerkOrg = await clerk.organizations.createOrganization({
      name: engagementName,
      createdBy: bruceClerkUserId,
    });
  } catch (e) {
    const msg = clerkErrorMessage(e);
    return {
      kind: "error",
      message: `Clerk Org creation failed: ${msg.slice(0, 200)}`,
    };
  }

  // 5. Insert orgs + engagements rows in one bootstrap transaction.
  //    On failure, try to delete the orphan Clerk Org so we don't leak
  //    a half-built tenant.
  const newAppOrgId = randomUUID();
  const newEngagementId = randomUUID();
  try {
    await withSystemContext(async (tx) => {
      // Use system context for the orgs INSERT — RLS WITH CHECK requires
      // GUC = new row's id, but the new org doesn't exist yet to set the
      // GUC against. System context (BYPASSRLS) is the legitimate
      // pre-tenant-context path for tenant bootstrap.
      await tx.insert(orgs).values({
        id: newAppOrgId,
        clerkOrgId: newClerkOrg.id,
        name: engagementName,
        type: "client",
      });
      await tx.insert(engagements).values({
        id: newEngagementId,
        orgId: newAppOrgId,
        coachId: callerCoach.id,
        type: engagementType,
        name: engagementName,
        startDate: new Date(startDate),
      });
    });
  } catch (e) {
    const msg = clerkErrorMessage(e);
    console.error(
      `DB insert failed after Clerk Org ${newClerkOrg.id} was created. ` +
        `Attempting to delete the orphan Clerk Org. Error: ${msg}`,
    );
    try {
      await clerk.organizations.deleteOrganization(newClerkOrg.id);
    } catch (cleanupErr) {
      console.error(
        `Could not auto-delete orphan Clerk Org ${newClerkOrg.id}. ` +
          `Manual cleanup needed via Clerk dashboard. ` +
          `Cleanup error: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
      );
    }
    return {
      kind: "error",
      message: `Database insert failed: ${msg.slice(0, 200)}`,
    };
  }

  // 6. Send the Clerk invitation. Bruce is still admin of the org here,
  //    which is required — Clerk's invitation API rejects calls from
  //    non-members with a 403 Forbidden.
  try {
    await clerk.organizations.createOrganizationInvitation({
      organizationId: newClerkOrg.id,
      inviterUserId: bruceClerkUserId,
      emailAddress: clientLeadEmail,
      role: "org:admin",
      publicMetadata: {
        app_role: "client_lead",
        client_lead_full_name: clientLeadFullName,
      },
    });
  } catch (e) {
    const msg = clerkErrorMessage(e);
    // Non-fatal: the engagement landed in DB; Bruce is still admin of
    // the Clerk Org, so he can resend the invitation manually from the
    // Clerk dashboard.
    console.warn(
      `Invitation send failed for ${clientLeadEmail} on Org ${newClerkOrg.id}: ${msg}`,
    );
    return {
      kind: "error",
      message:
        `Engagement created but invitation failed: ${msg.slice(0, 200)}. ` +
        `Resend the invitation manually from Clerk dashboard (you're still admin of that org).`,
    };
  }

  // 7. Remove Bruce as auto-added admin. Non-fatal if this fails — Bruce
  //    can clean up via Clerk dashboard. The invitation is already sent.
  try {
    await clerk.organizations.deleteOrganizationMembership({
      organizationId: newClerkOrg.id,
      userId: bruceClerkUserId,
    });
  } catch (e) {
    console.warn(
      `Failed to remove Bruce as auto-admin from new Org ${newClerkOrg.id}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  return {
    kind: "success",
    engagementId: newEngagementId,
    appOrgId: newAppOrgId,
    clerkOrgId: newClerkOrg.id,
    invitedEmail: clientLeadEmail,
  };
}
