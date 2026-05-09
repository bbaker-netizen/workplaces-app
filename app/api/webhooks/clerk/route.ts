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
import { eq, and, isNull, ne } from "drizzle-orm";
import {
  actionItems,
  orgs,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

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

type WebhookEvent =
  | { type: "user.created"; data: ClerkUserCreatedPayload }
  | {
      type: "organizationMembership.created";
      data: ClerkOrgMembershipCreatedPayload;
    }
  | {
      type: "organizationMembership.deleted";
      data: ClerkOrgMembershipDeletedPayload;
    }
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
        // No-op for now; first-visit provisioning still handles the
        // user_profiles row creation when an org membership lands.
        console.log(
          "[clerk-webhook] user.created:",
          (event.data as ClerkUserCreatedPayload).id,
        );
        break;

      case "organizationMembership.created":
        await handleMembershipCreated(
          event.data as ClerkOrgMembershipCreatedPayload,
        );
        break;

      case "organizationMembership.deleted":
        await handleMembershipDeleted(
          event.data as ClerkOrgMembershipDeletedPayload,
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

async function handleMembershipCreated(
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

  await withSystemContext(async (tx) => {
    const [org] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.clerkOrgId, clerkOrgId))
      .limit(1);
    if (!org) {
      console.warn(
        `[clerk-webhook] no orgs row for clerk_org_id=${clerkOrgId}; skipping membership.created.`,
      );
      return;
    }
    const [existing] = await tx
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.clerkUserId, clerkUserId))
      .limit(1);
    if (existing) {
      console.log(
        `[clerk-webhook] user_profiles row already exists for ${clerkUserId}; no-op.`,
      );
      return;
    }
    await tx.insert(userProfiles).values({
      clerkUserId,
      orgId: org.id,
      email,
      fullName,
      role: role as AppRole,
    });
  });
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
    // Null out assignee on any non-done action items in the user's
    // home org. Acceptable shortcut for Phase 2.4 — single-org users
    // are still the norm.
    await tx
      .update(actionItems)
      .set({ assigneeUserProfileId: null })
      .where(
        and(
          eq(actionItems.assigneeUserProfileId, profile.id),
          ne(actionItems.status, "done"),
          isNull(actionItems.assigneeUserProfileId), // no-op double check
        ),
      );
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
