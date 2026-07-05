/**
 * Clerk webhook handler.
 *
 * Phase 2.4. Replaces the first-visit auto-provision with proper
 * webhook-driven provisioning. Events handled:
 *
 *   - `user.created` — when a new Clerk user signs up. Doesn't yet
 *     have an active org context, so we don't create a `user_profiles`
 *     row here. The first-visit provisioning still handles that once
 *     the user lands on /portal with an active org. This handler logs
 *     the signup for audit purposes.
 *
 *   - `organizationMembership.created` — when a user accepts an
 *     invitation OR is added to an org. We create the `user_profiles`
 *     row eagerly so the first-visit experience is instant and never
 *     races on provisioning.
 *
 *   - `organizationMembership.deleted` — when a user is removed from
 *     an org. We don't delete the `user_profiles` row (audit history)
 *     but we DO null out the assignee on any open action items in
 *     that org. Phase 3 may add a `user_status` column for soft delete.
 *
 *   - `organization.deleted` — full org cleanup. The orgs row's
 *     ON DELETE CASCADE handles every dependent row in the database.
 *     Webhook just calls a system-context delete.
 *
 * Auth: svix signature verification via `CLERK_WEBHOOK_SECRET`. Add
 * the endpoint URL + secret in https://dashboard.clerk.com/last-active/webhooks.
 */

import { Webhook } from "svix";
import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import {
  actionItems,
  coaches,
  engagements,
  notifications,
  orgs,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import { clientAcceptedEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ClerkUserCreatedPayload = {
  id: string;
  email_addresses: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type ClerkOrgMembershipCreatedPayload = {
  id: string;
  organization: { id: string };
  public_user_data: {
    user_id: string;
    first_name?: string | null;
    last_name?: string | null;
    identifier?: string | null; // email
  };
  public_metadata?: { app_role?: string };
  role?: string;
};

type ClerkOrgMembershipDeletedPayload = {
  organization: { id: string };
  public_user_data: { user_id: string };
};

type ClerkOrganizationDeletedPayload = {
  id: string;
};

type ClerkUserUpdatedPayload = ClerkUserCreatedPayload;

type ClerkOrganizationUpdatedPayload = {
  id: string;
  name?: string | null;
  slug?: string | null;
};

type WebhookEvent =
  | { type: "user.created"; data: ClerkUserCreatedPayload }
  | { type: "user.updated"; data: ClerkUserUpdatedPayload }
  | {
      type: "organizationMembership.created";
      data: ClerkOrgMembershipCreatedPayload;
    }
  | {
      type: "organizationMembership.updated";
      data: ClerkOrgMembershipCreatedPayload;
    }
  | {
      type: "organizationMembership.deleted";
      data: ClerkOrgMembershipDeletedPayload;
    }
  | { type: "organization.updated"; data: ClerkOrganizationUpdatedPayload }
  | { type: "organization.deleted"; data: ClerkOrganizationDeletedPayload }
  | { type: string; data: unknown };

const VALID_ROLES = [
  "coach",
  "master_admin",
  "client_lead",
  "client_manager",
  "client_employee",
  "prospect",
] as const;
type AppRole = (typeof VALID_ROLES)[number];

function isValidRole(s: unknown): s is AppRole {
  return typeof s === "string" && (VALID_ROLES as readonly string[]).includes(s);
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CLERK_WEBHOOK_SECRET not configured." },
      { status: 500 },
    );
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing svix headers." },
      { status: 400 },
    );
  }

  const rawBody = await req.text();
  let event: WebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (e) {
    console.error("[clerk-webhook] signature verification failed:", e);
    return NextResponse.json(
      { error: "Invalid signature." },
      { status: 401 },
    );
  }

  try {
    switch (event.type) {
      case "user.created":
        // No row created here; we wait for the membership.created
        // event which carries the org context.
        break;

      case "user.updated":
        await handleUserUpdated(event.data as ClerkUserUpdatedPayload);
        break;

      case "organizationMembership.created":
      case "organizationMembership.updated":
        await handleMembershipUpserted(
          event.data as ClerkOrgMembershipCreatedPayload,
        );
        break;

      case "organizationMembership.deleted":
        await handleMembershipDeleted(
          event.data as ClerkOrgMembershipDeletedPayload,
        );
        break;

      case "organization.updated":
        await handleOrganizationUpdated(
          event.data as ClerkOrganizationUpdatedPayload,
        );
        break;

      case "organization.deleted":
        await handleOrganizationDeleted(
          event.data as ClerkOrganizationDeletedPayload,
        );
        break;

      default:
        // Unhandled event types are fine — Clerk fires many we don't care about.
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[clerk-webhook] handler error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

async function handleMembershipUpserted(
  data: ClerkOrgMembershipCreatedPayload,
): Promise<void> {
  const clerkOrgId = data.organization.id;
  const clerkUserId = data.public_user_data.user_id;
  const email = data.public_user_data.identifier ?? "";
  const fullName =
    [
      data.public_user_data.first_name,
      data.public_user_data.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || email;
  const role = isValidRole(data.public_metadata?.app_role)
    ? data.public_metadata!.app_role!
    : "client_employee";

  const isNewClient = await withSystemContext(async (tx) => {
    const [org] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.clerkOrgId, clerkOrgId))
      .limit(1);
    if (!org) {
      console.warn(
        `[clerk-webhook] no orgs row for clerk_org_id=${clerkOrgId}; skipping membership upsert.`,
      );
      return false;
    }
    const [existing] = await tx
      .select({ id: userProfiles.id, orgId: userProfiles.orgId })
      .from(userProfiles)
      .where(eq(userProfiles.clerkUserId, clerkUserId))
      .limit(1);
    if (existing) {
      // Mirror profile changes (role, name, email, org reassignment).
      await tx
        .update(userProfiles)
        .set({
          orgId: org.id,
          email: email || undefined,
          fullName: fullName || undefined,
          role: role as AppRole,
        })
        .where(eq(userProfiles.id, existing.id));
      return false;
    }
    await tx.insert(userProfiles).values({
      clerkUserId,
      orgId: org.id,
      email,
      fullName,
      role: role as AppRole,
    });
    // A brand-new CLIENT-side member just accepted their invite. (Coach /
    // master-admin memberships aren't client acceptances — don't notify.)
    return role === "client_lead" || role === "client_manager" || role === "client_employee";
  });

  if (isNewClient) {
    await notifyCoachOfClientAcceptance(clerkOrgId, fullName);
  }
}

/**
 * When a client accepts their invite and joins the portal, confirm it to
 * the engagement's Business Builder — an in-app notification plus an email
 * with the next steps. Best effort: never throw out of the webhook.
 */
async function notifyCoachOfClientAcceptance(
  clerkOrgId: string,
  clientName: string,
): Promise<void> {
  try {
    const info = await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({
          engagementId: engagements.id,
          engagementName: engagements.name,
          coachEmail: userProfiles.email,
          coachName: userProfiles.fullName,
          coachUserProfileId: userProfiles.id,
          coachOrgId: userProfiles.orgId,
        })
        .from(orgs)
        .innerJoin(engagements, eq(engagements.orgId, orgs.id))
        .innerJoin(coaches, eq(coaches.id, engagements.coachId))
        .innerJoin(userProfiles, eq(userProfiles.id, coaches.userProfileId))
        .where(eq(orgs.clerkOrgId, clerkOrgId))
        .limit(1);
      return row ?? null;
    });
    if (!info) return;

    // In-app notification in the coach's feed.
    await withSystemContext(async (tx) => {
      await tx.insert(notifications).values({
        orgId: info.coachOrgId,
        userProfileId: info.coachUserProfileId,
        type: "message",
        parentEntityType: "client_accepted",
        parentEntityId: info.engagementId,
        sentVia: "both",
      });
    });

    // Confirmation email with next steps.
    if (info.coachEmail) {
      await sendEmailQuietly({
        ...clientAcceptedEmail({
          to: info.coachEmail,
          coachName: info.coachName ?? "there",
          clientName,
          engagementName: info.engagementName ?? "your client",
          engagementUrl: `/business-builder/engagements/${info.engagementId}`,
        }),
        bypassWorkingHours: true,
      });
    }
  } catch (e) {
    console.error("[clerk-webhook] client-acceptance notify failed:", e);
  }
}

async function handleMembershipDeleted(
  data: ClerkOrgMembershipDeletedPayload,
): Promise<void> {
  const clerkUserId = data.public_user_data.user_id;
  await withSystemContext(async (tx) => {
    const [profile] = await tx
      .select({ id: userProfiles.id, orgId: userProfiles.orgId })
      .from(userProfiles)
      .where(eq(userProfiles.clerkUserId, clerkUserId))
      .limit(1);
    if (!profile) return;
    // Null out the assignee on every non-done action item the user owned
    // so work doesn't disappear behind a removed account. The user_profiles
    // row stays for audit history.
    await tx
      .update(actionItems)
      .set({ assigneeUserProfileId: null })
      .where(
        and(
          eq(actionItems.assigneeUserProfileId, profile.id),
          ne(actionItems.status, "done"),
        ),
      );
  });
}

async function handleUserUpdated(
  data: ClerkUserUpdatedPayload,
): Promise<void> {
  const primaryEmail =
    data.email_addresses.find((e) => e.id === data.primary_email_address_id)
      ?.email_address ??
    data.email_addresses[0]?.email_address ??
    null;
  const fullName =
    [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || null;
  if (!primaryEmail && !fullName) return;
  await withSystemContext(async (tx) => {
    const updates: Partial<typeof userProfiles.$inferInsert> = {};
    if (primaryEmail) updates.email = primaryEmail;
    if (fullName) updates.fullName = fullName;
    await tx
      .update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.clerkUserId, data.id));
  });
}

async function handleOrganizationUpdated(
  data: ClerkOrganizationUpdatedPayload,
): Promise<void> {
  if (!data.name) return;
  await withSystemContext(async (tx) => {
    await tx
      .update(orgs)
      .set({ name: data.name! })
      .where(eq(orgs.clerkOrgId, data.id));
  });
}

async function handleOrganizationDeleted(
  data: ClerkOrganizationDeletedPayload,
): Promise<void> {
  const clerkOrgId = data.id;
  await withSystemContext(async (tx) => {
    // ON DELETE CASCADE in the schema cleans up dependents.
    await tx.delete(orgs).where(eq(orgs.clerkOrgId, clerkOrgId));
  });
}
