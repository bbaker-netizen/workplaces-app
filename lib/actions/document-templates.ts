"use server";

/**
 * Document templates — CRUD for the markdown bodies used by the
 * native signing compose flow. Master-admin and Coach only.
 */

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { documentTemplates } from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";
import { DOCUMENT_TEMPLATE_CATEGORIES } from "@/lib/signing/document-variables";

const categoryEnum = z.enum(DOCUMENT_TEMPLATE_CATEGORIES);

const upsertSchema = z.object({
  name: z.string().min(1).max(200),
  category: categoryEnum.default("other"),
  bodyMarkdown: z.string().max(200_000).default(""),
  defaultSubject: z.string().max(500).nullable().optional(),
});

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createDocumentTemplate(
  input: z.input<typeof upsertSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  try {
    const [row] = await withTenantContext(profile.orgId, async (tx) =>
      tx
        .insert(documentTemplates)
        .values({
          orgId: profile.orgId,
          name: parsed.data.name,
          category: parsed.data.category,
          bodyMarkdown: parsed.data.bodyMarkdown,
          defaultSubject: parsed.data.defaultSubject ?? null,
          createdByUserProfileId: profile.userProfileId,
        })
        .returning({ id: documentTemplates.id }),
    );
    revalidatePath("/business-builder/templates");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateDocumentTemplate(
  id: string,
  input: z.input<typeof upsertSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .update(documentTemplates)
        .set({
          name: parsed.data.name,
          category: parsed.data.category,
          bodyMarkdown: parsed.data.bodyMarkdown,
          defaultSubject: parsed.data.defaultSubject ?? null,
        })
        .where(
          and(
            eq(documentTemplates.id, id),
            eq(documentTemplates.orgId, profile.orgId),
          ),
        );
    });
    revalidatePath("/business-builder/templates");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteDocumentTemplate(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .delete(documentTemplates)
        .where(
          and(
            eq(documentTemplates.id, id),
            eq(documentTemplates.orgId, profile.orgId),
          ),
        );
    });
    revalidatePath("/business-builder/templates");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
