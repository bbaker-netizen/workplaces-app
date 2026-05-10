"use server";

/**
 * Person Profile actions — TTI assessment per individual.
 *
 * Phase 3.5. Per CLAUDE.md, person_profile is a first-class entity:
 * each row captures someone's TTI TriMetrix HD assessment + linked
 * gap report PDF. Internal scores stay internal (IP exposure rules);
 * the summary text is what surfaces.
 *
 * Authorization: leadership-only (master_admin / coach / client_lead /
 * client_manager). client_employee CAN view their OWN profile but
 * not others — gating happens at the page level via user_profile_id
 * match.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { personProfiles, type UserProfile } from "@/lib/db/schema";
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

const sourceEnum = z.enum(["tti_trimetrix_hd", "manual"]);

const createSchema = z.object({
  engagementId: z.string().uuid(),
  fullName: z.string().min(1).max(200),
  role: z.string().max(200).nullable().optional(),
  source: sourceEnum.default("tti_trimetrix_hd"),
  userProfileId: z.string().uuid().nullable().optional(),
  documentId: z.string().uuid().nullable().optional(),
  summary: z.string().max(50000).nullable().optional(),
  rawScores: z.record(z.string(), z.unknown()).optional(),
  assessmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

const updateSchema = createSchema.partial().omit({ engagementId: true });

export async function createPersonProfile(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't add person profiles." };
  const parsed = createSchema.safeParse(input);
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
          .insert(personProfiles)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            userProfileId: data.userProfileId ?? null,
            fullName: data.fullName,
            role: data.role ?? null,
            source: data.source,
            documentId: data.documentId ?? null,
            summary: data.summary ?? null,
            rawScores: data.rawScores ?? {},
            assessmentDate: data.assessmentDate
              ? new Date(data.assessmentDate)
              : null,
          })
          .returning({ id: personProfiles.id });
        return row;
      },
    );
    revalidatePath("/portal/people");
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updatePersonProfile(
  id: string,
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't edit person profiles." };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord(
    "person_profiles" as never,
    id,
  );
  // person_profiles isn't in the resolver enum yet; do a manual lookup.
  // Phase 3.5b will add it. For now, query via a direct SELECT.
  const realEngagementId =
    engagementId ?? (await lookupPersonProfileEngagement(id));
  if (!realEngagementId)
    return { ok: false, error: "Person profile not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      realEngagementId,
      async (tx) => {
        const update: Partial<typeof personProfiles.$inferInsert> = {};
        if (data.fullName !== undefined) update.fullName = data.fullName;
        if (data.role !== undefined) update.role = data.role;
        if (data.source !== undefined) update.source = data.source;
        if (data.userProfileId !== undefined)
          update.userProfileId = data.userProfileId;
        if (data.documentId !== undefined)
          update.documentId = data.documentId;
        if (data.summary !== undefined) update.summary = data.summary;
        if (data.rawScores !== undefined) update.rawScores = data.rawScores;
        if (data.assessmentDate !== undefined)
          update.assessmentDate = data.assessmentDate
            ? new Date(data.assessmentDate)
            : null;
        if (Object.keys(update).length === 0) return;
        await tx
          .update(personProfiles)
          .set(update)
          .where(eq(personProfiles.id, id));
      },
    );
    revalidatePath("/portal/people");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deletePersonProfile(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't delete person profiles." };
  const realEngagementId = await lookupPersonProfileEngagement(id);
  if (!realEngagementId)
    return { ok: false, error: "Person profile not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      realEngagementId,
      async (tx) => {
        await tx.delete(personProfiles).where(eq(personProfiles.id, id));
      },
    );
    revalidatePath("/portal/people");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function lookupPersonProfileEngagement(
  id: string,
): Promise<string | null> {
  const { withSystemContext } = await import("@/lib/db/tenant");
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ engagementId: personProfiles.engagementId })
      .from(personProfiles)
      .where(eq(personProfiles.id, id))
      .limit(1);
    return row?.engagementId ?? null;
  });
}
