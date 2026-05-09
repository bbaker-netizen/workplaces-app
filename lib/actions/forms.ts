"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  forms,
  formSubmissions,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";

type Role = UserProfile["role"];
function canEdit(role: Role): boolean {
  return (
    role === "master_admin" ||
    role === "coach" ||
    role === "client_lead" ||
    role === "client_manager"
  );
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const typeEnum = z.enum(["diagnostic", "intake", "pulse", "nps", "custom"]);
const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["text", "textarea", "radio", "scale", "checkbox"]),
  label: z.string().min(1).max(500),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
});

const createFormSchema = z.object({
  engagementId: z.string().uuid(),
  name: z.string().min(1).max(500),
  description: z.string().max(20000).nullable().optional(),
  type: typeEnum,
  schema: z.array(questionSchema).default([]),
  isActive: z.boolean().default(true),
});

const updateFormSchema = createFormSchema.partial().omit({
  engagementId: true,
});

export async function createForm(
  input: z.input<typeof createFormSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't create forms." };
  const parsed = createFormSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        const [row] = await tx
          .insert(forms)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            name: data.name,
            description: data.description ?? null,
            type: data.type,
            schema: data.schema,
            isActive: data.isActive,
          })
          .returning({ id: forms.id });
        return row;
      },
    );
    revalidatePath("/portal/forms");
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateForm(
  id: string,
  input: z.input<typeof updateFormSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't edit forms." };
  const parsed = updateFormSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord("forms", id);
  if (!engagementId) return { ok: false, error: "Form not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const update: Partial<typeof forms.$inferInsert> = {};
        if (data.name !== undefined) update.name = data.name;
        if (data.description !== undefined)
          update.description = data.description;
        if (data.type !== undefined) update.type = data.type;
        if (data.schema !== undefined) update.schema = data.schema;
        if (data.isActive !== undefined) update.isActive = data.isActive;
        if (Object.keys(update).length === 0) return;
        await tx.update(forms).set(update).where(eq(forms.id, id));
      },
    );
    revalidatePath("/portal/forms");
    revalidatePath(`/portal/forms/${id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteForm(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't delete forms." };
  const engagementId = await resolveEngagementIdFromRecord("forms", id);
  if (!engagementId) return { ok: false, error: "Form not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx.delete(forms).where(eq(forms.id, id));
      },
    );
    revalidatePath("/portal/forms");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

const submitSchema = z.object({
  formId: z.string().uuid(),
  answers: z.record(z.string(), z.unknown()),
  respondentName: z.string().max(200).nullable().optional(),
  respondentEmail: z.string().email().nullable().optional(),
});

export async function submitForm(
  input: z.input<typeof submitSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord(
    "forms",
    data.formId,
  );
  if (!engagementId) return { ok: false, error: "Form not found." };
  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        const [row] = await tx
          .insert(formSubmissions)
          .values({
            orgId: boundOrgId,
            formId: data.formId,
            submittedByUserProfileId: profile.userProfileId,
            respondentName: data.respondentName ?? null,
            respondentEmail: data.respondentEmail ?? null,
            answers: data.answers,
          })
          .returning({ id: formSubmissions.id });
        return row;
      },
    );
    revalidatePath(`/portal/forms/${data.formId}`);
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
