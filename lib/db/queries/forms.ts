import { desc, eq } from "drizzle-orm";
import {
  forms,
  formSubmissions,
  type Form,
  type FormSubmission,
} from "../schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type FormQuestion = {
  id: string;
  type: "text" | "textarea" | "radio" | "scale" | "checkbox";
  label: string;
  required?: boolean;
  options?: string[];
};

export async function listEngagementForms(
  engagementId: string,
): Promise<Form[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) =>
        tx
          .select()
          .from(forms)
          .where(eq(forms.engagementId, engagementId)),
    );
  } catch {
    return [];
  }
}

export async function getForm(id: string): Promise<Form | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  const engagementId = await resolveEngagementIdFromRecord("forms", id);
  if (!engagementId) return null;
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(forms)
          .where(eq(forms.id, id))
          .limit(1);
        return row ?? null;
      },
    );
  } catch {
    return null;
  }
}

export async function listFormSubmissions(
  formId: string,
): Promise<FormSubmission[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  const engagementId = await resolveEngagementIdFromRecord("forms", formId);
  if (!engagementId) return [];
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) =>
        tx
          .select()
          .from(formSubmissions)
          .where(eq(formSubmissions.formId, formId))
          .orderBy(desc(formSubmissions.submittedAt)),
    );
  } catch {
    return [];
  }
}
