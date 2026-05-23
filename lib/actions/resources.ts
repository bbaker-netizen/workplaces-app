"use server";

/**
 * Resource library CRUD — Bruce + Jen's catalogue of apps, videos,
 * and tutorials. Master_admin / Coach only. RLS scopes everything
 * by org, but we double-check the orgId on every mutation.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { resources } from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";
import { listNetlifySites, isNetlifyConfigured } from "@/lib/integrations/netlify";

const typeEnum = z.enum(["tool", "video", "document", "link"]);
const audienceEnum = z.enum(["coach_only", "client", "public"]);

const upsertSchema = z.object({
  title: z.string().trim().min(2, "Title is required.").max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  type: typeEnum.default("document"),
  url: z
    .string()
    .trim()
    .max(2000)
    .url("URL must be a valid http(s) link.")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  thumbnailUrl: z
    .string()
    .trim()
    .max(2000)
    .url("Thumbnail must be a valid http(s) link.")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  audience: audienceEnum.default("coach_only"),
  isPublished: z.boolean().optional(),
});

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createResource(
  input: z.input<typeof upsertSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  try {
    const [row] = await withTenantContext(profile.orgId, async (tx) =>
      tx
        .insert(resources)
        .values({
          orgId: profile.orgId,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          type: parsed.data.type,
          url: parsed.data.url ?? null,
          thumbnailUrl: parsed.data.thumbnailUrl ?? null,
          tags: parsed.data.tags ?? [],
          audience: parsed.data.audience,
          isPublished: parsed.data.isPublished ?? true,
          createdByUserProfileId: profile.userProfileId,
        })
        .returning({ id: resources.id }),
    );
    revalidatePath("/business-builder/library");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateResource(
  id: string,
  input: z.input<typeof upsertSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .update(resources)
        .set({
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          type: parsed.data.type,
          url: parsed.data.url ?? null,
          thumbnailUrl: parsed.data.thumbnailUrl ?? null,
          tags: parsed.data.tags ?? [],
          audience: parsed.data.audience,
          isPublished: parsed.data.isPublished ?? true,
        })
        .where(and(eq(resources.id, id), eq(resources.orgId, profile.orgId)));
    });
    revalidatePath("/business-builder/library");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteResource(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .delete(resources)
        .where(and(eq(resources.id, id), eq(resources.orgId, profile.orgId)));
    });
    revalidatePath("/business-builder/library");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Keep these imports live in case future actions need them.
void desc;
void asc;

/**
 * Pull every site from Bruce's Netlify account and upsert into the
 * resources library as type='tool' rows. Re-runs are idempotent —
 * matches on (org_id, source='netlify', source_id=site.id), updates
 * title + URL + last_synced_at but preserves any description / tags
 * / audience the user has customised.
 *
 * Returns counts so the UI can render an honest summary.
 */
export async function syncNetlifyTools(): Promise<
  ActionResult<{ added: number; updated: number; total: number }>
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  if (!isNetlifyConfigured()) {
    return {
      ok: false,
      error:
        "Netlify isn't connected yet. Add NETLIFY_PERSONAL_ACCESS_TOKEN to your Netlify env vars (get a token at https://app.netlify.com/user/applications#personal-access-tokens), then redeploy and try again.",
    };
  }

  let sites: Awaited<ReturnType<typeof listNetlifySites>>;
  try {
    sites = await listNetlifySites();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let added = 0;
  let updated = 0;
  const now = new Date();

  try {
    await withTenantContext(profile.orgId, async (tx) => {
      // Load existing netlify-sourced resources so we can decide
      // upsert vs insert.
      const existing = await tx
        .select({
          id: resources.id,
          sourceId: resources.sourceId,
        })
        .from(resources)
        .where(
          and(
            eq(resources.orgId, profile.orgId),
            eq(resources.source, "netlify"),
          ),
        );
      const bySourceId = new Map(
        existing.filter((r) => r.sourceId).map((r) => [r.sourceId!, r.id]),
      );

      for (const site of sites) {
        const friendlyTitle = site.name
          // Netlify names are kebab-case; humanise them.
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const url = site.sslUrl || site.url;
        const existingId = bySourceId.get(site.id);
        if (existingId) {
          await tx
            .update(resources)
            .set({
              title: friendlyTitle,
              url,
              lastSyncedAt: now,
            })
            .where(eq(resources.id, existingId));
          updated += 1;
        } else {
          await tx.insert(resources).values({
            orgId: profile.orgId,
            title: friendlyTitle,
            description: site.customDomain
              ? `Custom domain: ${site.customDomain}`
              : null,
            type: "tool",
            url,
            tags: ["netlify"],
            audience: "coach_only",
            isPublished: true,
            source: "netlify",
            sourceId: site.id,
            lastSyncedAt: now,
            createdByUserProfileId: profile.userProfileId,
          });
          added += 1;
        }
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/business-builder/library");
  return {
    ok: true,
    data: { added, updated, total: sites.length },
  };
}
