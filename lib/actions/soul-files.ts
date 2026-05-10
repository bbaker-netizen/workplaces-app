"use server";

/**
 * Soul Files — server actions.
 *
 * Phase 1.7. Surface:
 *   - `upsertSoulFileBody(engagementId, body)` — write the markdown
 *     body. Creates the row if none exists. Leadership-only write
 *     (master_admin / coach / client_lead / client_manager).
 *
 * Reads live in `lib/db/queries/soul-files.ts`.
 */

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  engagements,
  soulFileChunks,
  soulFiles,
  type UserProfile,
} from "@/lib/db/schema";
import { withEngagementContext } from "@/lib/db/tenant";
import { embedText } from "@/lib/ai/embeddings";
import { chunkMarkdown } from "@/lib/ai/chunking";

type Role = UserProfile["role"];

const LEADERSHIP_ROLES: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];

function canEdit(role: Role): boolean {
  return (LEADERSHIP_ROLES as readonly string[]).includes(role);
}

const upsertSchema = z.object({
  engagementId: z.string().uuid(),
  body: z.string().max(200000), // Soul Files can run long.
});

export type UpsertSoulFileInput = z.input<typeof upsertSchema>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function upsertSoulFileBody(
  input: UpsertSoulFileInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEdit(profile.role)) {
    return { ok: false, error: "Your role can't edit the Soul File." };
  }
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  try {
    const id = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        const [eng] = await tx
          .select({ id: engagements.id })
          .from(engagements)
          .where(eq(engagements.id, data.engagementId))
          .limit(1);
        if (!eng) throw new Error("Engagement not found.");

        const [existing] = await tx
          .select({ id: soulFiles.id })
          .from(soulFiles)
          .where(eq(soulFiles.engagementId, data.engagementId))
          .limit(1);

        if (existing) {
          await tx
            .update(soulFiles)
            .set({
              body: data.body,
              lastEditorUserProfileId: profile.userProfileId,
            })
            .where(eq(soulFiles.id, existing.id));
          return existing.id;
        }
        const [row] = await tx
          .insert(soulFiles)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            body: data.body,
            lastEditorUserProfileId: profile.userProfileId,
          })
          .returning({ id: soulFiles.id });
        return row.id;
      },
    );

    // Embed the new body for semantic search. Two layers:
    //   1. Document-level embedding on `soul_files.embedding` — used
    //      for "most relevant whole document" queries.
    //   2. Chunk-level embeddings on `soul_file_chunks` — used for
    //      finer-grained retrieval (most relevant paragraph).
    // Best-effort — failures log but don't propagate. OPENAI_API_KEY
    // being unset is the most common skip reason; acceptable.
    if (data.body.trim().length > 0) {
      try {
        const documentVector = await embedText(data.body);
        const formatted = `[${documentVector.join(",")}]`;
        await withEngagementContext(
          profile.orgId,
          profile.role,
          data.engagementId,
          async (tx) => {
            await tx.execute(
              sql`UPDATE soul_files
                  SET embedding = ${formatted}::vector,
                      embedding_updated_at = now()
                  WHERE id = ${id}`,
            );
          },
        );
      } catch (e) {
        console.error("[soul-file] document embed failed (non-fatal):", e);
      }

      // Chunk-level. Replace the entire chunk set on each save —
      // simpler than diffing and Soul Files don't update often enough
      // to matter cost-wise.
      try {
        const chunks = chunkMarkdown(data.body);
        const chunkVectors = await Promise.all(
          chunks.map((chunk) => embedText(chunk)),
        );
        await withEngagementContext(
          profile.orgId,
          profile.role,
          data.engagementId,
          async (tx, boundOrgId) => {
            await tx
              .delete(soulFileChunks)
              .where(eq(soulFileChunks.soulFileId, id));
            for (let i = 0; i < chunks.length; i++) {
              const formatted = `[${chunkVectors[i].join(",")}]`;
              await tx.execute(
                sql`INSERT INTO soul_file_chunks
                      (soul_file_id, org_id, engagement_id, chunk_index, body, embedding)
                    VALUES
                      (${id},
                       ${boundOrgId},
                       ${data.engagementId},
                       ${i},
                       ${chunks[i]},
                       ${formatted}::vector)`,
              );
            }
          },
        );
      } catch (e) {
        console.error("[soul-file] chunk embed failed (non-fatal):", e);
      }
    }

    revalidatePath("/portal/soul-file");
    revalidatePath(`/coach/soul-file/${data.engagementId}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Cross-engagement Soul File search by semantic similarity to a
 * natural-language query. Coach-only — uses system context to span
 * tenants. Returns top N results ranked by cosine distance.
 */
export async function searchSoulFiles(
  query: string,
  limit = 5,
): Promise<
  | {
      ok: true;
      data: Array<{
        engagementId: string;
        engagementName: string | null;
        snippet: string;
        distance: number;
      }>;
    }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Coach-only." };
  if (!query.trim()) return { ok: true, data: [] };

  let queryVector: number[];
  try {
    queryVector = await embedText(query);
  } catch (e) {
    return {
      ok: false,
      error: `Embedding failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const formatted = `[${queryVector.join(",")}]`;

  // System context — coaches search across every engagement they own.
  const { withSystemContext } = await import("@/lib/db/tenant");
  type Row = {
    engagementId: string;
    engagementName: string | null;
    snippet: string;
    distance: number;
  };
  try {
    // Prefer chunk-level matches when available; fall back to
    // document-level for engagements that haven't been re-indexed yet.
    const queryResult = await withSystemContext(async (tx) =>
      tx.execute(
        sql`WITH ranked AS (
              SELECT sfc.engagement_id,
                     e.name AS engagement_name,
                     substring(sfc.body for 320) AS snippet,
                     sfc.embedding <=> ${formatted}::vector AS distance,
                     ROW_NUMBER() OVER (
                       PARTITION BY sfc.engagement_id
                       ORDER BY sfc.embedding <=> ${formatted}::vector
                     ) AS rn
                FROM soul_file_chunks sfc
                INNER JOIN engagements e ON e.id = sfc.engagement_id
                INNER JOIN coaches c ON c.id = e.coach_id
                INNER JOIN user_profiles up ON up.id = c.user_profile_id
               WHERE sfc.embedding IS NOT NULL
                 AND up.id = ${profile.userProfileId}
            )
            SELECT engagement_id AS "engagementId",
                   engagement_name AS "engagementName",
                   snippet,
                   distance
              FROM ranked
             WHERE rn = 1
             ORDER BY distance
             LIMIT ${limit}`,
      ),
    );
    let rows = (queryResult as unknown as { rows?: Row[] }).rows ?? [];
    if (rows.length === 0) {
      // Fallback to document-level when no chunks exist yet.
      const fallback = await withSystemContext(async (tx) =>
        tx.execute(
          sql`SELECT s.engagement_id AS "engagementId",
                     e.name AS "engagementName",
                     substring(s.body for 240) AS snippet,
                     s.embedding <=> ${formatted}::vector AS distance
              FROM soul_files s
              INNER JOIN engagements e ON e.id = s.engagement_id
              INNER JOIN coaches c ON c.id = e.coach_id
              INNER JOIN user_profiles up ON up.id = c.user_profile_id
              WHERE s.embedding IS NOT NULL
                AND up.id = ${profile.userProfileId}
              ORDER BY s.embedding <=> ${formatted}::vector
              LIMIT ${limit}`,
        ),
      );
      rows = (fallback as unknown as { rows?: Row[] }).rows ?? [];
    }
    return { ok: true, data: rows };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
