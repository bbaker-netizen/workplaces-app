"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { coaches, engagements, orgs, prospects } from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";

function slugify(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? `${base}-${id.slice(0, 6)}` : id.slice(0, 12);
}

/**
 * Server action: create a new engagement and invite its client lead.
 *
 * Steps (order matters — see failure-mode comments below):
 *   1. Verify the caller is a Business Builder (master_admin or coach) —
 *      extra check on top of the Console layout role gate, defence in
 *      depth for direct API hits. Every Business Builder can invite their
 *      own clients, not just the master admin.
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
  onboardingTemplateId: z
    .string()
    .uuid("Invalid template id")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Form checkbox — when present (HTML form sends "on" / undefined),
  // we pull the last 3 Fireflies transcripts with this client's email
  // and Claude drafts a Soul File starter.
  seedSoulFile: z
    .union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()])
    .transform((v) => v === "on" || v === "true")
    .optional(),
  // Monthly fee — dollars (input is type="number"). Optional; the
  // engagement can be created without a fee set and the {{monthly_fee}}
  // placeholder will render as "[monthly fee]" until set.
  monthlyFee: z
    .union([z.literal(""), z.undefined()])
    .transform(() => undefined)
    .or(
      z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, "Fee must be a positive number")
        .transform((s) => Math.round(parseFloat(s) * 100)),
    )
    .optional(),
  pricingTier: z
    .string()
    .max(60)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** If converting from a prospect record, the prospect's UUID. The
   *  action sets prospects.converted_engagement_id back-reference and
   *  bumps the prospect's status to "onboarded". */
  prospectId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
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
  // 1. Verify caller is a Business Builder (master_admin or coach). Any
  //    Business Builder can create an engagement and invite its client
  //    lead — not just the master admin.
  const callerProfile = await ensureUserProfile();
  if (callerProfile.status !== "ok") {
    return { kind: "error", message: "Not signed in." };
  }
  if (
    callerProfile.role !== "master_admin" &&
    callerProfile.role !== "coach"
  ) {
    return {
      kind: "error",
      message: "Only Business Builders can create engagements.",
    };
  }

  // 2. Validate input
  const parsed = schema.safeParse({
    engagementName: formData.get("engagementName"),
    engagementType: formData.get("engagementType"),
    clientLeadEmail: formData.get("clientLeadEmail"),
    clientLeadFullName: formData.get("clientLeadFullName"),
    startDate: formData.get("startDate"),
    onboardingTemplateId: formData.get("onboardingTemplateId") ?? undefined,
    seedSoulFile: formData.get("seedSoulFile") ?? undefined,
    monthlyFee: formData.get("monthlyFee") ?? undefined,
    pricingTier: formData.get("pricingTier") ?? undefined,
    prospectId: formData.get("prospectId") ?? undefined,
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
  const monthlyFeeCents = parsed.data.monthlyFee ?? null;
  const pricingTier = parsed.data.pricingTier ?? null;

  // 3. Ensure Bruce has a Business Builderes row (lazy create)
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
        slug: slugify(engagementName, newEngagementId),
        startDate: new Date(startDate),
        monthlyFeeCents,
        pricingTier,
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
  //
  //    redirectUrl: tells Clerk where to send the user AFTER they
  //    accept + sign up. Without this, Clerk falls back to its
  //    generic "Welcome / Start Building" dev landing page instead
  //    of the actual Workplaces portal — which is what new clients
  //    were seeing. Points at /portal/welcome (the onboarding tour
  //    page we built in Phase 5).
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://workplaces-the-builder.netlify.app";
  const redirectUrl = `${appUrl.replace(/\/+$/, "")}/portal/welcome`;
  let invitationUrl: string | null = null;
  try {
    // First attempt: call the Clerk REST API directly with `notify: false`
    // in the body. The Clerk Node SDK doesn't type this param on org
    // invitations (only on user-level invitations), but the underlying
    // REST endpoint historically accepts it as an undocumented field.
    // When honored, Clerk skips sending its own bland default email and
    // we get a clean slate where our branded Workplaces welcome email
    // is the only email the recipient receives.
    //
    // If the REST call fails for any reason (rejected param, network
    // hiccup, future Clerk change), fall back to the SDK call — the
    // engagement still works, the recipient just gets Clerk's email
    // alongside ours, same as before.
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    let restSucceeded = false;
    if (clerkSecret) {
      try {
        const resp = await fetch(
          `https://api.clerk.com/v1/organizations/${encodeURIComponent(newClerkOrg.id)}/invitations`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${clerkSecret}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              email_address: clientLeadEmail,
              role: "org:admin",
              inviter_user_id: bruceClerkUserId,
              redirect_url: redirectUrl,
              notify: false, // suppress Clerk's default email
              public_metadata: {
                app_role: "client_lead",
                client_lead_full_name: clientLeadFullName,
              },
            }),
          },
        );
        if (resp.ok) {
          const json = (await resp.json()) as { url?: string | null };
          invitationUrl = json.url ?? null;
          restSucceeded = true;
        } else {
          const text = await resp.text().catch(() => "");
          console.warn(
            `[engagement-create] Clerk REST invitation (notify:false) failed ${resp.status}: ${text.slice(0, 300)} — falling back to SDK (which sends Clerk's email).`,
          );
        }
      } catch (restErr) {
        console.warn(
          `[engagement-create] Clerk REST call threw, falling back to SDK: ${
            restErr instanceof Error ? restErr.message : String(restErr)
          }`,
        );
      }
    }

    if (!restSucceeded) {
      // SDK fallback. Sends Clerk's default email but at least the
      // invitation still gets created and the engagement is usable.
      const invitation =
        await clerk.organizations.createOrganizationInvitation({
          organizationId: newClerkOrg.id,
          inviterUserId: bruceClerkUserId,
          emailAddress: clientLeadEmail,
          role: "org:admin",
          redirectUrl,
          publicMetadata: {
            app_role: "client_lead",
            client_lead_full_name: clientLeadFullName,
          },
        });
      invitationUrl =
        (invitation as { url?: string | null }).url ?? null;
    }
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

  // 7b. Fire the branded Workplaces welcome email IMMEDIATELY after
  //     the Clerk invitation. This lands before / alongside Clerk's
  //     bland default invitation so the first thing the recipient sees
  //     is a vibrant on-brand welcome from Bruce, with the accept link
  //     as the primary CTA. Best-effort: a failure here is logged but
  //     never blocks engagement creation.
  if (invitationUrl) {
    try {
      const { sendEmailQuietly } = await import("@/lib/email/send");
      const { engagementWelcomeEmail } = await import("@/lib/email/templates");
      const { userProfiles } = await import("@/lib/db/schema");
      const sender = await withSystemContext(async (tx) => {
        const [u] = await tx
          .select({
            fullName: userProfiles.fullName,
            email: userProfiles.email,
          })
          .from(userProfiles)
          .where(eq(userProfiles.id, callerProfile.userProfileId))
          .limit(1);
        return u ?? null;
      });
      if (sender) {
        await sendEmailQuietly({
          ...engagementWelcomeEmail({
            to: clientLeadEmail,
            recipientName: clientLeadFullName,
            engagementName,
            engagementType,
            startDate,
            acceptUrl: invitationUrl,
            senderName: sender.fullName,
            senderEmail: sender.email,
            senderTitle: "Coach · Workplaces",
          }),
          // Welcome should fire the moment Bruce hits create, no
          // matter the time of day. Working-hours guard exists for
          // notifications, not for transactional welcomes.
          bypassWorkingHours: true,
        });
      }
    } catch (e) {
      console.warn(
        `[engagement-create] branded welcome email failed for ${newEngagementId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  // 8. If Bruce picked an onboarding template, fire a personal welcome
  //    email right behind the Clerk invitation. Best-effort: a failure
  //    here doesn't roll back the engagement — Bruce can still send it
  //    manually from the Templates page if needed.
  if (parsed.data.onboardingTemplateId && callerProfile.status === "ok") {
    try {
      await fireOnboardingEmail({
        templateId: parsed.data.onboardingTemplateId,
        toEmail: clientLeadEmail,
        toName: clientLeadFullName,
        engagementName: parsed.data.engagementName,
        senderUserProfileId: callerProfile.userProfileId,
        engagementId: newEngagementId,
        engagementOrgId: newAppOrgId,
      });
    } catch (e) {
      console.warn(
        `Onboarding email failed for engagement ${newEngagementId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  // 9. If Bruce ticked "Seed Soul File from Fireflies", pull the last
  //    3 transcripts where this client's email is an attendee and
  //    have Claude draft a starter Soul File. Best-effort — never
  //    blocks the success return.
  if (parsed.data.seedSoulFile) {
    try {
      const { seedSoulFileFromFireflies } = await import(
        "@/lib/soul-files/seed-from-fireflies"
      );
      const result = await seedSoulFileFromFireflies({
        engagementId: newEngagementId,
        engagementOrgId: newAppOrgId,
        clientLeadEmail,
        engagementName,
        senderUserProfileId: callerProfile.userProfileId,
        maxTranscripts: 3,
      });
      if (result.kind === "seeded") {
        console.log(
          `[engagement-create] Soul File seeded for ${newEngagementId} from ${result.transcriptCount} Fireflies transcript(s) (${result.bodyLength} chars).`,
        );
      } else if (result.kind === "no_transcripts") {
        console.log(
          `[engagement-create] No Fireflies transcripts found for ${clientLeadEmail} — Soul File starts empty.`,
        );
      } else {
        console.warn(
          `[engagement-create] Soul File seed skipped: ${result.reason}`,
        );
      }
    } catch (e) {
      console.warn(
        `[engagement-create] Soul File seed threw: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  // Back-link the source prospect if we converted from one — sets
  // prospects.converted_engagement_id and flips status to onboarded
  // so the prospect drops out of the "active deals" view and into
  // the historical record.
  if (parsed.data.prospectId) {
    try {
      await withSystemContext(async (tx) => {
        await tx
          .update(prospects)
          .set({
            convertedEngagementId: newEngagementId,
            status: "onboarded",
          })
          .where(eq(prospects.id, parsed.data.prospectId!));
      });
    } catch (e) {
      console.warn(
        `[engagement-create] couldn't back-link prospect ${parsed.data.prospectId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    kind: "success",
    engagementId: newEngagementId,
    appOrgId: newAppOrgId,
    clerkOrgId: newClerkOrg.id,
    invitedEmail: clientLeadEmail,
  };
}

/**
 * Send the onboarding email after engagement creation. Uses Bruce's
 * connected Gmail when available so the email lands in his Sent folder
 * and the conversation history stays in his inbox; falls back to Resend
 * if Gmail isn't connected (so the email still goes out).
 */
async function fireOnboardingEmail(args: {
  templateId: string;
  toEmail: string;
  toName: string;
  engagementName: string;
  senderUserProfileId: string;
  engagementId: string;
  engagementOrgId: string;
}): Promise<void> {
  const { emailTemplates, userProfiles, clientCommunications } = await import(
    "@/lib/db/schema"
  );
  const { eq } = await import("drizzle-orm");
  const { applyTemplate } = await import("@/lib/templates/variables");

  const data = await withSystemContext(async (tx) => {
    const [tmpl] = await tx
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, args.templateId))
      .limit(1);
    const [sender] = await tx
      .select({
        name: userProfiles.fullName,
        email: userProfiles.email,
        emailSignature: userProfiles.emailSignature,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, args.senderUserProfileId))
      .limit(1);
    return { tmpl: tmpl ?? null, sender: sender ?? null };
  });
  if (!data.tmpl || !data.sender) return;

  const vars: Record<string, string> = {
    company_name: args.engagementName,
    contact_name: args.toName,
    contact_first_name: args.toName.split(" ")[0] ?? args.toName,
    contact_email: args.toEmail,
    sender_name: data.sender.name,
    sender_first_name: data.sender.name.split(" ")[0] ?? data.sender.name,
    sender_email: data.sender.email,
  };
  const subject = applyTemplate(data.tmpl.subject, vars);
  const bodyTextOnly = applyTemplate(data.tmpl.body, vars);
  const { appendSignature, markdownToEmailHtml } = await import(
    "@/lib/templates/markdown-to-html"
  );
  const body = appendSignature(bodyTextOnly, data.sender.emailSignature ?? null);
  const bodyHtml = markdownToEmailHtml(body);

  // Try Gmail first, then Resend.
  const { sendGmailMessage } = await import("@/lib/integrations/gmail");
  let sentVia: "gmail" | "resend" | null = null;
  let externalId: string | null = null;
  try {
    const r = await sendGmailMessage(args.senderUserProfileId, data.sender.email, {
      to: [args.toEmail],
      subject,
      body,
      bodyHtml,
    });
    sentVia = "gmail";
    externalId = r.messageId;
  } catch (e) {
    // Likely: Gmail not connected. Fall through to Resend.
    console.warn(
      "[onboarding-email] Gmail send failed, falling back to Resend:",
      e instanceof Error ? e.message : e,
    );
    try {
      const { sendEmail } = await import("@/lib/email/send");
      const r = await sendEmail({
        to: args.toEmail,
        subject,
        html: bodyHtml,
        text: body,
        bypassWorkingHours: true,
      });
      if (r.delivered) {
        sentVia = "resend";
        externalId = r.id;
      }
    } catch (e2) {
      console.warn(
        "[onboarding-email] Resend fallback also failed:",
        e2 instanceof Error ? e2.message : e2,
      );
    }
  }

  // Log the outbound message into the engagement's communications log.
  if (sentVia) {
    try {
      await withTenantContext(args.engagementOrgId, async (tx) => {
        await tx.insert(clientCommunications).values({
          orgId: args.engagementOrgId,
          engagementId: args.engagementId,
          channel: "email",
          direction: "outbound",
          fromAddress: data.sender!.email,
          toAddresses: [args.toEmail],
          subject,
          body,
          externalId,
          occurredAt: new Date(),
          createdByUserProfileId: args.senderUserProfileId,
        });
      });
    } catch (e) {
      console.warn(
        "[onboarding-email] Failed to log communication:",
        e instanceof Error ? e.message : e,
      );
    }
  }
}
