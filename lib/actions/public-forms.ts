"use server";

/**
 * Public form actions — anonymous fill via short token URL.
 *
 * Phase 2.8. The diagnostic intake form for prospects (per the
 * Workflow table in CLAUDE.md) needs to be fillable without a Clerk
 * account. This module exposes a token-based path:
 *
 *   1. The coach activates a form's `public_token` (auto-generated).
 *   2. They share `https://workplaces-the-builder.netlify.app/forms/respond/<token>`.
 *   3. The recipient fills + submits without authenticating.
 *
 * Public submissions skip RLS via `withSystemContext` because the
 * caller has no tenant binding. The form's `org_id` and `engagement_id`
 * are pulled from the form record itself.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { forms, formSubmissions, prospects } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
  withSystemContext,
} from "@/lib/db/tenant";
import { randomBytes } from "node:crypto";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function newPublicToken(): string {
  // 32 base64url chars, urlsafe and short enough for QR codes.
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Activate (or rotate) the public token for a form. Leadership only.
 * Setting `null` revokes public access.
 */
export async function setFormPublicToken(
  formId: string,
  enable: boolean,
): Promise<ActionResult<{ token: string | null }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (
    profile.role !== "master_admin" &&
    profile.role !== "coach" &&
    profile.role !== "client_lead" &&
    profile.role !== "client_manager"
  )
    return { ok: false, error: "Your role can't change form sharing." };

  const engagementId = await resolveEngagementIdFromRecord("forms", formId);
  if (!engagementId) return { ok: false, error: "Form not found." };
  const token = enable ? newPublicToken() : null;
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx
          .update(forms)
          .set({ publicToken: token })
          .where(eq(forms.id, formId));
      },
    );
    revalidatePath(`/portal/forms/${formId}`);
    return { ok: true, data: { token } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

const submitSchema = z.object({
  token: z.string().min(8).max(80),
  answers: z.record(z.string(), z.unknown()),
  respondentName: z.string().max(200).nullable().optional(),
  respondentEmail: z.string().email().nullable().optional(),
});

export async function submitPublicForm(
  input: z.input<typeof submitSchema>,
): Promise<ActionResult<{ submissionId: string }>> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  try {
    const result = await withSystemContext(async (tx) => {
      const [form] = await tx
        .select({
          id: forms.id,
          orgId: forms.orgId,
          type: forms.type,
          isActive: forms.isActive,
        })
        .from(forms)
        .where(eq(forms.publicToken, data.token))
        .limit(1);
      if (!form) throw new Error("Form not found.");
      if (!form.isActive)
        throw new Error("This form is no longer accepting responses.");
      const [row] = await tx
        .insert(formSubmissions)
        .values({
          orgId: form.orgId,
          formId: form.id,
          submittedByUserProfileId: null,
          respondentName: data.respondentName ?? null,
          respondentEmail: data.respondentEmail ?? null,
          answers: data.answers,
        })
        .returning({ id: formSubmissions.id });

      // Diagnostic forms auto-create a Prospect row. Per CLAUDE.md
      // workflow: "Native diagnostic form; submission auto-creates a
      // Prospect record." Phase 3.6.
      if (form.type === "diagnostic" && data.respondentEmail) {
        const companyGuess =
          (data.answers as Record<string, unknown>)["company"] ??
          (data.answers as Record<string, unknown>)["company_name"] ??
          (data.answers as Record<string, unknown>)["business_name"] ??
          data.respondentName ??
          data.respondentEmail;
        await tx.insert(prospects).values({
          orgId: form.orgId,
          companyName: String(companyGuess).slice(0, 200),
          contactName: data.respondentName ?? null,
          contactEmail: data.respondentEmail,
          status: "diagnostic_complete",
          diagnosticSubmissionId: row.id,
        });
      }

      return row;
    });
    return { ok: true, data: { submissionId: result.id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
