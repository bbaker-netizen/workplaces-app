/**
 * The three onboarding sends, each callable without a Clerk session.
 *
 * **Why this module exists, and why it has no `"use server"`.** The
 * sequence is staggered over several minutes, so it runs in a Netlify
 * Background Function. There is no signed-in user there: `auth()` returns
 * nothing and anything built on `ensureUserProfile()` denies. That trap
 * has now bitten this codebase four separate times — `topUpAllSeries`,
 * `carryForwardAgenda`, the Fireflies cron, and the EA jobs — and each
 * time the symptom was a job that reported success while doing nothing.
 *
 * So the acting Builder is passed in explicitly, resolved from the
 * onboarding run row rather than from a session, and their Clerk identity
 * is read from `user_profiles.clerk_user_id`.
 *
 * Authorization happens ONCE, in the server action that starts the run,
 * where there IS a session. By the time these functions execute, the
 * question "is this Builder allowed to onboard this client" has already
 * been answered — which is why they take a pre-authorized actor and do
 * not re-check. Nothing here is reachable from a browser.
 */

import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import {
  documents,
  engagements,
  orgs,
  prospects,
  signatureEnvelopes,
  signatureSigners,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { uploadDocumentBlob } from "@/lib/storage/blobs";
import { renderPadFormPdf } from "@/lib/payments/pad-form";
import { loadPadContext } from "@/lib/payments/pad-context";
import { makeAuditEntry, type AuditEntry } from "@/lib/signing/audit";
import { newSigningToken } from "@/lib/signing/token";
import { emailNextPendingSigner } from "@/lib/signing/notify";
import { sendEmailQuietly } from "@/lib/email/send";
import {
  clientOnboardingEmail,
  engagementWelcomeEmail,
  personProfileInviteEmail,
} from "@/lib/email/templates";
import { getConnectionStatus } from "@/lib/integrations/google-calendar";

export type OnboardingActor = {
  userProfileId: string;
  fullName: string;
  email: string;
  clerkUserId: string | null;
};

export type StepResult = { ok: true } | { ok: false; error: string };

function errText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

/* ------------------------------ step 1 ------------------------------ */

/**
 * The onboarding email, from the Builder's own Gmail.
 *
 * Sent from their mailbox rather than the app's notification address for
 * the same reason session recaps are: this is a note from their coach,
 * not a system receipt, and a reply needs to reach a human. It also means
 * the client has the sender's real address on file BEFORE the payment
 * form arrives — which is exactly what makes the payment request
 * verifiable rather than suspicious.
 *
 * Falls back to the app's transactional sender when Google is not
 * connected. A deliberate degradation: an onboarding that stalls at step
 * one because a token expired is worse than one sent from the app
 * address, and the two steps that follow would otherwise arrive with no
 * explanation at all.
 */
export async function sendOnboardingEmail(
  engagementId: string,
  actor: OnboardingActor,
): Promise<StepResult> {
  try {
    const ctx = await withSystemContext(async (tx) => {
      const [eng] = await tx
        .select({
          id: engagements.id,
          name: engagements.name,
          assessmentDueDate: engagements.assessmentDueDate,
        })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      const [p] = await tx
        .select({
          contactName: prospects.contactName,
          contactEmail: prospects.contactEmail,
        })
        .from(prospects)
        .where(eq(prospects.convertedEngagementId, engagementId))
        .limit(1);
      const [me] = await tx
        .select({ signature: userProfiles.emailSignature })
        .from(userProfiles)
        .where(eq(userProfiles.id, actor.userProfileId))
        .limit(1);
      return { eng: eng ?? null, prospect: p ?? null, signature: me?.signature ?? null };
    });

    if (!ctx.eng) return { ok: false, error: "Client record not found." };
    const to = ctx.prospect?.contactEmail?.trim();
    if (!to) return { ok: false, error: "No contact email on the client." };

    const firstSession = await firstScheduledSessionIso(engagementId);

    const envelope = clientOnboardingEmail({
      to,
      recipientName: ctx.prospect?.contactName ?? ctx.eng.name ?? "there",
      engagementName: ctx.eng.name ?? "your engagement",
      firstSessionDate: firstSession ?? "",
      senderName: actor.fullName,
      senderEmail: actor.email,
      signature: ctx.signature,
      // Null until a Business Builder sets it in the onboarding panel;
      // the template drops the line rather than inventing a date.
      assessmentDueDate: ctx.eng.assessmentDueDate
        ? String(ctx.eng.assessmentDueDate).slice(0, 10)
        : null,
    });

    const google = await getConnectionStatus(actor.userProfileId);
    if (google.connected && google.email) {
      try {
        const { sendGmailMessage } = await import("@/lib/integrations/gmail");
        await sendGmailMessage(actor.userProfileId, google.email, {
          to: [to],
          subject: envelope.subject,
          body: envelope.text,
          bodyHtml: envelope.html,
        });
        return { ok: true };
      } catch (e) {
        console.error(
          "[onboarding] Gmail send failed, falling back to the app sender:",
          e,
        );
      }
    }

    // Onboarding is explicitly operator-triggered and the client is
    // expecting it, so it bypasses the working-hours guard rather than
    // sitting until Monday while steps two and three land ahead of it.
    const r = await sendEmailQuietly({ ...envelope, bypassWorkingHours: true });
    return r.delivered
      ? { ok: true }
      : { ok: false, error: "The onboarding email could not be delivered." };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

async function firstScheduledSessionIso(
  engagementId: string,
): Promise<string | null> {
  const { bbsSessions } = await import("@/lib/db/schema");
  const { and, gte, ne, asc } = await import("drizzle-orm");
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ at: bbsSessions.scheduledAt })
      .from(bbsSessions)
      .where(
        and(
          eq(bbsSessions.engagementId, engagementId),
          gte(bbsSessions.scheduledAt, new Date()),
          ne(bbsSessions.status, "cancelled"),
        ),
      )
      .orderBy(asc(bbsSessions.scheduledAt))
      .limit(1);
    return row ? row.at.toISOString().slice(0, 10) : null;
  });
}

/* ------------------------------ step 2 ------------------------------ */

/**
 * The pre-authorized debit form, sent for signature.
 *
 * Mirrors `requestPaymentAuthorization` but builds the envelope inline
 * rather than going through `createSignatureEnvelope`, which is a server
 * action and therefore requires the session this context does not have.
 * The envelope shape — one signer, sequential routing, kind
 * `payment_authorization` — is identical, and the signer email goes out
 * through the same `emailNextPendingSigner` both paths use, so the client
 * receives exactly what they would from the manual button.
 */
export async function sendPaymentAuthorization(
  engagementId: string,
  actor: OnboardingActor,
): Promise<StepResult> {
  try {
    const ctx = await withSystemContext(async (tx) => {
      const [eng] = await tx
        .select({ id: engagements.id, orgId: engagements.orgId })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      if (!eng) return null;
      const [p] = await tx
        .select({
          id: prospects.id,
          contactName: prospects.contactName,
          contactEmail: prospects.contactEmail,
        })
        .from(prospects)
        .where(eq(prospects.convertedEngagementId, engagementId))
        .limit(1);
      return { eng, prospect: p ?? null };
    });
    if (!ctx) return { ok: false, error: "Client record not found." };

    const signerEmail = ctx.prospect?.contactEmail?.trim();
    const signerName = ctx.prospect?.contactName?.trim();
    if (!signerEmail || !signerName)
      return { ok: false, error: "No named contact with an email address." };

    const padCtx = await loadPadContext({
      orgId: ctx.eng.orgId,
      prospectId: ctx.prospect?.id ?? null,
      engagementId,
    });

    const blank = await renderPadFormPdf({
      payeeName: padCtx.payeeName,
      payeeAddress: padCtx.payeeAddress,
      clientName: signerName,
      clientCompany: padCtx.clientCompany,
      amountLabel: padCtx.amountLabel,
      values: null,
    });
    const file = new File(
      [new Uint8Array(blank)],
      "Pre-authorized debit form.pdf",
      { type: "application/pdf" },
    );
    const upload = await uploadDocumentBlob(ctx.eng.orgId, file);

    const envelopeId = await withSystemContext(async (tx) => {
      const [doc] = await tx
        .insert(documents)
        .values({
          id: upload.documentId,
          orgId: ctx.eng.orgId,
          engagementId,
          prospectId: ctx.prospect?.id ?? null,
          blobKey: upload.blobKey,
          originalFilename: upload.filename,
          fileType: upload.fileType,
          sizeBytes: upload.sizeBytes,
          uploaderUserProfileId: actor.userProfileId,
        })
        .returning({ id: documents.id });

      const audit: AuditEntry[] = [
        makeAuditEntry("envelope_created", { by: actor.email }),
      ];
      const [env] = await tx
        .insert(signatureEnvelopes)
        .values({
          orgId: ctx.eng.orgId,
          prospectId: ctx.prospect?.id ?? null,
          engagementId,
          sourceDocumentId: doc.id,
          subject: "Pre-authorized debit authorization",
          message:
            "Please add your banking details and sign. They go straight onto the signed form — nobody re-keys them.",
          kind: "payment_authorization",
          routing: "sequential",
          status: "in_progress",
          createdByUserProfileId: actor.userProfileId,
          auditLog: audit,
        })
        .returning({ id: signatureEnvelopes.id });

      await tx.insert(signatureSigners).values({
        envelopeId: env.id,
        orgId: ctx.eng.orgId,
        orderIndex: 0,
        name: signerName,
        email: signerEmail,
        roleLabel: "Account holder",
        publicToken: newSigningToken(),
        status: "pending",
      });

      return env.id;
    });

    await emailNextPendingSigner(envelopeId, actor.fullName);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/* ------------------------------ step 3 ------------------------------ */

/**
 * The portal invitation. Last on purpose.
 *
 * Accepting it drops the client into their workspace, so it must not
 * land before the modules and the Soul File are ready — which is why the
 * whole sequence is a button a Builder presses rather than something
 * that fires automatically when the agreement is signed.
 *
 * Session-free twin of `inviteClientToPortal`. The coach's Clerk user id
 * comes from `user_profiles.clerk_user_id` instead of `auth()`; every
 * other step is identical, including stepping the Builder back out as
 * auto-admin so the client's organisation is left clean.
 */
export async function sendPortalInvite(
  engagementId: string,
  actor: OnboardingActor,
): Promise<StepResult> {
  if (!actor.clerkUserId)
    return {
      ok: false,
      error:
        "Your account has no Clerk identity on file, so the client organisation can't be created.",
    };

  try {
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
      return { eng, org: org ?? null, prospect: p ?? null };
    });

    if (!ctx || !ctx.org) return { ok: false, error: "Client not found." };
    if (!ctx.org.clerkOrgId.startsWith("pending:")) {
      // Not an error worth failing the run over — the client already has
      // their portal, which is the outcome this step exists to produce.
      return { ok: true };
    }
    const clientEmail = ctx.prospect?.contactEmail?.trim();
    if (!clientEmail)
      return { ok: false, error: "No contact email on the client." };
    const clientName = ctx.prospect?.contactName ?? ctx.eng.name ?? "there";
    const orgName = ctx.eng.name ?? "Client";

    const clerk = await clerkClient();
    const newClerkOrg = await clerk.organizations.createOrganization({
      name: orgName,
      createdBy: actor.clerkUserId,
    });

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
      return { ok: false, error: `Linking the org failed: ${errText(e)}` };
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://builder.4workplaces.com";
    const redirectUrl = `${appUrl.replace(/\/+$/, "")}/portal/welcome`;
    let invitationUrl: string | null = null;
    try {
      const invitation = await clerk.organizations.createOrganizationInvitation({
        organizationId: newClerkOrg.id,
        inviterUserId: actor.clerkUserId,
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
        error: `The portal is linked but the invitation failed: ${errText(e)}`,
      };
    }

    // Step the Builder back out as auto-admin (non-fatal).
    try {
      await clerk.organizations.deleteOrganizationMembership({
        organizationId: newClerkOrg.id,
        userId: actor.clerkUserId,
      });
    } catch {
      /* can be cleaned up from the Clerk dashboard */
    }

    if (invitationUrl) {
      try {
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
            senderName: actor.fullName,
            senderEmail: actor.email,
            senderTitle: "Coach · Workplaces",
          }),
          bypassWorkingHours: true,
        });
      } catch {
        /* the Clerk invitation itself has already gone */
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/* ------------------------------ step 4 ------------------------------ */

/**
 * The Person Profile assessment invitation, to both participants.
 *
 * Last in the sequence because it is the only step that asks the client
 * to DO something (about 45 minutes, in one sitting) rather than to
 * receive something. Putting that ahead of the portal invite would land
 * the biggest ask before they have anywhere to log in.
 *
 * Sent per participant, not once to the primary contact, because the
 * second participant is a real person with their own email on the record
 * and forwarding is how a step gets quietly dropped.
 *
 * SKIPS rather than fails when the practice has no assessment URL set.
 * A missing configuration value is not a broken onboarding, and mailing
 * a new client a dead link on day one is worse than mailing nothing.
 */
export async function sendPersonProfileAssessment(
  engagementId: string,
  actor: OnboardingActor,
): Promise<StepResult & { skipped?: true }> {
  try {
    const ctx = await withSystemContext(async (tx) => {
      const [eng] = await tx
        .select({
          id: engagements.id,
          orgId: engagements.orgId,
          assessmentDueDate: engagements.assessmentDueDate,
        })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      if (!eng) return null;
      const [p] = await tx
        .select({
          contactName: prospects.contactName,
          contactEmail: prospects.contactEmail,
          contact2FirstName: prospects.contact2FirstName,
          contact2Email: prospects.contact2Email,
        })
        .from(prospects)
        .where(eq(prospects.convertedEngagementId, engagementId))
        .limit(1);
      const [o] = await tx
        .select({ url: orgs.personProfileAssessmentUrl })
        .from(orgs)
        .where(eq(orgs.id, eng.orgId))
        .limit(1);
      const [me] = await tx
        .select({ signature: userProfiles.emailSignature })
        .from(userProfiles)
        .where(eq(userProfiles.id, actor.userProfileId))
        .limit(1);
      return {
        eng,
        prospect: p ?? null,
        url: o?.url ?? null,
        signature: me?.signature ?? null,
      };
    });

    if (!ctx) return { ok: false, error: "Client record not found." };
    if (!ctx.url) return { ok: true, skipped: true };

    const due = ctx.eng.assessmentDueDate
      ? String(ctx.eng.assessmentDueDate).slice(0, 10)
      : null;

    const recipients: { email: string; name: string }[] = [];
    if (ctx.prospect?.contactEmail?.trim()) {
      recipients.push({
        email: ctx.prospect.contactEmail.trim(),
        name: ctx.prospect.contactName?.split(" ")[0] ?? "there",
      });
    }
    if (ctx.prospect?.contact2Email?.trim()) {
      recipients.push({
        email: ctx.prospect.contact2Email.trim(),
        name: ctx.prospect.contact2FirstName ?? "there",
      });
    }
    if (recipients.length === 0) {
      return { ok: false, error: "No participant email on the client." };
    }

    const google = await getConnectionStatus(actor.userProfileId);
    let anyDelivered = false;

    for (const r of recipients) {
      const envelope = personProfileInviteEmail({
        to: r.email,
        recipientName: r.name,
        assessmentUrl: ctx.url,
        dueDate: due,
        senderName: actor.fullName,
        senderEmail: actor.email,
        signature: ctx.signature,
      });

      if (google.connected && google.email) {
        try {
          const { sendGmailMessage } = await import("@/lib/integrations/gmail");
          await sendGmailMessage(actor.userProfileId, google.email, {
            to: [r.email],
            subject: envelope.subject,
            body: envelope.text,
            bodyHtml: envelope.html,
          });
          anyDelivered = true;
          continue;
        } catch (e) {
          console.error(
            "[onboarding] Gmail send failed for the assessment invite, falling back:",
            e,
          );
        }
      }
      const sent = await sendEmailQuietly({
        ...envelope,
        bypassWorkingHours: true,
      });
      if (sent.delivered) anyDelivered = true;
    }

    return anyDelivered
      ? { ok: true }
      : { ok: false, error: "The assessment invitation could not be delivered." };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}
