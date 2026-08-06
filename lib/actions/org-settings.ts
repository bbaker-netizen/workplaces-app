"use server";

/**
 * Org-level settings — the company info that ends up on contracts,
 * invoices, and email shells. Master_admin only (it's their entity).
 *
 * Updates the caller's home org. We don't allow changing `clerk_org_id`
 * or `type` from here — those are infrastructure fields, not user
 * settings.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { orgs } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

const optional = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .nullable();

const updateOrgSchema = z.object({
  name: z.string().trim().min(2, "Display name is required.").max(200),
  legalName: optional,
  businessAddress: optional,
  businessCity: optional,
  businessProvince: optional,
  businessCountry: optional,
  businessPostalCode: optional,
  businessPhone: optional,
  businessWebsite: optional,
  taxId: optional,
});

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function updateOrgSettings(
  input: z.input<typeof updateOrgSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin")
    return {
      ok: false,
      error: "Master admins only — Bruce, this is your business.",
    };

  const parsed = updateOrgSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };

  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(orgs)
        .set({
          name: parsed.data.name,
          legalName: parsed.data.legalName,
          businessAddress: parsed.data.businessAddress,
          businessCity: parsed.data.businessCity,
          businessProvince: parsed.data.businessProvince,
          businessCountry: parsed.data.businessCountry,
          businessPostalCode: parsed.data.businessPostalCode,
          businessPhone: parsed.data.businessPhone,
          businessWebsite: parsed.data.businessWebsite,
          taxId: parsed.data.taxId,
          updatedAt: new Date(),
        })
        .where(eq(orgs.id, profile.orgId));
    });
    revalidatePath("/business-builder/settings/company");
    revalidatePath("/", "layout"); // sidebar shows org name
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const assessmentUrlSchema = z.object({
  url: z.string().trim().max(500),
});

/**
 * The TTI survey link used by onboarding step 4 (Person Profile).
 *
 * Practice-level rather than per-person because TTI issues one survey
 * link per context with no per-participant identity in it — there is no
 * finer thing to store. Blank clears it, which SKIPS the onboarding step
 * with the reason recorded rather than failing the run: a new client
 * mailed a dead link on day one is worse than a step that didn't fire.
 */
export async function savePersonProfileAssessmentUrl(
  input: z.input<typeof assessmentUrlSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin")
    return { ok: false, error: "Only the practice owner can set this." };
  const parsed = assessmentUrlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const url = parsed.data.url;
  // Same rule as the card payment link: blank clears, anything else must
  // be a real https link. A malformed URL emailed to a new client is a
  // step that looks done and isn't.
  if (url && !/^https:\/\/\S+$/.test(url))
    return { ok: false, error: "Enter a full https:// link, or leave blank." };
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(orgs)
        .set({
          personProfileAssessmentUrl: url || null,
          updatedAt: new Date(),
        })
        .where(eq(orgs.id, profile.orgId));
    });
    revalidatePath("/business-builder/settings/quickbooks-billing");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
