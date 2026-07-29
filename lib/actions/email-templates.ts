"use server";

/**
 * Email template CRUD + variable interpolation.
 *
 * Templates store a subject and body with {{variable}} placeholders.
 * At send time, `applyTemplate` substitutes the placeholders against
 * a context object (prospect or engagement). Unknown variables are
 * left as-is so the user notices and fills them in.
 */

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  emailTemplates,
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";
import {
  applyTemplate,
  TEMPLATE_CATEGORIES as CATEGORY_VALUES,
} from "@/lib/templates/variables";

const upsertSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(CATEGORY_VALUES).default("other"),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50_000),
});

export async function createEmailTemplate(
  input: z.input<typeof upsertSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
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
    const row = await withTenantContext(profile.orgId, async (tx) => {
      const [created] = await tx
        .insert(emailTemplates)
        .values({
          orgId: profile.orgId,
          name: parsed.data.name,
          category: parsed.data.category,
          subject: parsed.data.subject,
          body: parsed.data.body,
          createdByUserProfileId: profile.userProfileId,
        })
        .returning({ id: emailTemplates.id });
      return created;
    });
    revalidatePath("/business-builder/templates");
    return { ok: true, id: row.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

export async function updateEmailTemplate(
  id: string,
  input: z.input<typeof upsertSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
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
        .update(emailTemplates)
        .set({
          name: parsed.data.name,
          category: parsed.data.category,
          subject: parsed.data.subject,
          body: parsed.data.body,
          updatedAt: new Date(),
        })
        .where(eq(emailTemplates.id, id));
    });
    revalidatePath("/business-builder/templates");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

export async function deleteEmailTemplate(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx.delete(emailTemplates).where(eq(emailTemplates.id, id));
    });
    revalidatePath("/business-builder/templates");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

/**
 * Resolve a template against a prospect — fetches the prospect + sender,
 * returns the prefilled subject + body. The composer takes it from there.
 */
export async function resolveTemplateForProspect(args: {
  templateId: string;
  prospectId: string;
}): Promise<
  | { ok: true; subject: string; body: string }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  try {
    const data = await withSystemContext(async (tx) => {
      const [tmpl] = await tx
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.id, args.templateId))
        .limit(1);
      const [p] = await tx
        .select({
          companyName: prospects.companyName,
          contactName: prospects.contactName,
          contactFirstName: prospects.contactFirstName,
          contactPreferredName: prospects.contactPreferredName,
          contactEmail: prospects.contactEmail,
          contact2FirstName: prospects.contact2FirstName,
          contact2PreferredName: prospects.contact2PreferredName,
        })
        .from(prospects)
        .where(eq(prospects.id, args.prospectId))
        .limit(1);
      const [sender] = await tx
        .select({ name: userProfiles.fullName, email: userProfiles.email })
        .from(userProfiles)
        .where(eq(userProfiles.id, profile.userProfileId))
        .limit(1);
      // The OTHER Business Builder, for "{{partner_first_name}} and I are
      // excited to work with you". Derived from who the Business Builders
      // actually are — NOT a hardcoded two-person map, which breaks the
      // moment there's a third. Blank when it can't be resolved
      // unambiguously, so the sentence never invents a colleague.
      const others = await tx
        .select({ name: userProfiles.fullName })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.orgId, profile.orgId),
            inArray(userProfiles.role, ["master_admin", "coach"]),
            ne(userProfiles.id, profile.userProfileId),
          ),
        );
      const partnerName = others.length === 1 ? others[0].name : null;
      return {
        tmpl: tmpl ?? null,
        p: p ?? null,
        sender: sender ?? null,
        partnerName,
      };
    });
    if (!data.tmpl) return { ok: false, error: "Template not found." };
    if (!data.p) return { ok: false, error: "Prospect not found." };

    // What to call the client: preferred name, else stored first name, else
    // the first word of the full name for rows written before those columns.
    const clientFirst =
      data.p.contactPreferredName?.trim() ||
      data.p.contactFirstName?.trim() ||
      (data.p.contactName ?? "").split(" ")[0] ||
      "";
    const partnerFirst =
      data.p.contact2PreferredName?.trim() ||
      data.p.contact2FirstName?.trim() ||
      "";
    const hasPartner = partnerFirst.length > 0;

    const vars: Record<string, string> = {
      company_name: data.p.companyName,
      contact_name: data.p.contactName ?? "",
      contact_first_name: clientFirst,
      contact_email: data.p.contactEmail,
      sender_name: data.sender?.name ?? "Workplaces",
      sender_first_name:
        (data.sender?.name ?? "Workplaces").split(" ")[0] ?? "Workplaces",
      sender_email: data.sender?.email ?? "",
      contact_partner_first_name: partnerFirst,
      partner_first_name: data.partnerName?.split(" ")[0] ?? "",
      // Solo-vs-two wording, resolved here so the sentence reads correctly
      // either way. Patching only the first phrase is exactly how you end up
      // with "you and ." followed by a plural noun.
      client_and_partner: hasPartner ? `you and ${partnerFirst}` : "you",
      assessment_noun: hasPartner ? "Assessments" : "Assessment",
      assessment_completed_sentence: hasPartner
        ? "We need these completed"
        : "We need it completed",
    };
    return {
      ok: true,
      subject: applyTemplate(data.tmpl.subject, vars),
      body: applyTemplate(data.tmpl.body, vars),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

// Variables + categories live in lib/templates/variables.ts so client
// components can import them without the "use server" constraint.
