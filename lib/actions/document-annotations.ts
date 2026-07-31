"use server";

/**
 * Saving PDF markup.
 *
 * Business Builders only. Markup is an internal review tool — the client
 * portal has no markup surface, so there is no audience model to apply here
 * beyond "is this person on the practice side, and may they reach this
 * client".
 *
 * The second half of that question is not answered in this file: every write
 * runs through `withEngagementContext`, which enforces the per-Business-
 * Builder client grants at the foundation. A coach restricted to their own
 * book cannot write markup onto another coach's client document by pasting an
 * id, and that holds without this module having to remember to check.
 *
 * Client-generated ids. The editor mints a UUID per annotation and saves with
 * it, so a save is an upsert rather than an insert-then-learn-the-id. That is
 * what makes the overlay optimistic without a round trip per stroke, and it
 * makes a retried save idempotent instead of duplicating the mark.
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { documentAnnotations, documents } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
  withSystemContext,
} from "@/lib/db/tenant";
import { ANNOTATION_KINDS, clamp01 } from "@/lib/pdf/annotations";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Caps exist so one pathological save cannot bloat a row past what the page
 * can render or the burn step can draw. A freehand stroke of 4000 points is
 * already far beyond what a hand produces in one drag.
 */
const MAX_INK_POINTS = 4000;
const MAX_BODY_CHARS = 8000;
const MAX_IMAGE_CHARS = 900_000; // ~650 KB of base64, matching the signature cap

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const saveSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  pageNumber: z.number().int().min(1).max(5000),
  kind: z.enum(ANNOTATION_KINDS),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite(),
  h: z.number().finite(),
  points: z.array(pointSchema).max(MAX_INK_POINTS).nullable().optional(),
  body: z.string().max(MAX_BODY_CHARS).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value.")
    .default("#1A1A1A"),
  fontSize: z.number().finite().min(4).max(96).nullable().optional(),
  strokeWidth: z.number().finite().min(0.5).max(24).nullable().optional(),
  opacity: z.number().finite().min(0).max(1).nullable().optional(),
  imageData: z.string().max(MAX_IMAGE_CHARS).nullable().optional(),
});

export type SaveAnnotationInput = z.input<typeof saveSchema>;

/** Business-Builder gate, shared by every action here. */
async function requireBusinessBuilder() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false as const, error: "Not authenticated." };
  }
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false as const, error: "Markup is for Business Builders." };
  }
  return { ok: true as const, profile };
}

export async function saveAnnotation(
  input: SaveAnnotationInput,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireBusinessBuilder();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { profile } = gate;

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That markup isn't valid.",
    };
  }
  const a = parsed.data;

  const engagementId = await resolveEngagementIdFromRecord(
    "documents",
    a.documentId,
  );
  if (!engagementId) {
    return {
      ok: false,
      error: "Markup is only available on engagement documents.",
    };
  }

  // Ink is stored normalized like everything else, so clamping here keeps a
  // stroke that ran off the page edge inside the page rather than letting the
  // burn step draw outside the crop box.
  const points =
    a.kind === "ink" && a.points
      ? a.points.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
      : null;

  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, orgId) => {
        // Confirm the document is in the bound org before writing a child row
        // against it. RLS covers cross-org, and the FK covers non-existence,
        // but neither produces a sensible message on its own.
        const [doc] = await tx
          .select({ id: documents.id })
          .from(documents)
          .where(eq(documents.id, a.documentId))
          .limit(1);
        if (!doc) throw new Error("Document not found.");

        const values = {
          id: a.id,
          orgId,
          documentId: a.documentId,
          pageNumber: a.pageNumber,
          kind: a.kind,
          x: clamp01(a.x),
          y: clamp01(a.y),
          // Extents may be negative when a box was dragged up or left; the
          // burn step normalizes direction, so only the magnitude is bounded.
          w: Math.max(-1, Math.min(1, a.w)),
          h: Math.max(-1, Math.min(1, a.h)),
          points,
          body: a.body ?? null,
          color: a.color,
          fontSize: a.fontSize ?? null,
          strokeWidth: a.strokeWidth ?? null,
          opacity: a.opacity ?? null,
          imageData: a.imageData ?? null,
          authorUserProfileId: profile.userProfileId,
        };

        await tx
          .insert(documentAnnotations)
          .values(values)
          .onConflictDoUpdate({
            target: documentAnnotations.id,
            set: {
              pageNumber: values.pageNumber,
              kind: values.kind,
              x: values.x,
              y: values.y,
              w: values.w,
              h: values.h,
              points: values.points,
              body: values.body,
              color: values.color,
              fontSize: values.fontSize,
              strokeWidth: values.strokeWidth,
              opacity: values.opacity,
              imageData: values.imageData,
            },
          });
      },
    );
    return { ok: true, data: { id: a.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteAnnotation(
  annotationId: string,
): Promise<ActionResult> {
  const gate = await requireBusinessBuilder();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { profile } = gate;

  if (!z.string().uuid().safeParse(annotationId).success) {
    return { ok: false, error: "Invalid markup id." };
  }

  // `resolveEngagementIdFromRecord` has no case for this table, so the parent
  // document is resolved first, then the engagement through it. System
  // context because the point of the lookup is to find out WHICH tenant to
  // bind to; there is no org to scope by yet.
  const documentId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ documentId: documentAnnotations.documentId })
      .from(documentAnnotations)
      .where(eq(documentAnnotations.id, annotationId))
      .limit(1);
    return row?.documentId ?? null;
  });
  if (!documentId) return { ok: false, error: "Markup not found." };

  const engagementId = await resolveEngagementIdFromRecord(
    "documents",
    documentId,
  );
  if (!engagementId) return { ok: false, error: "Markup not found." };

  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx
          .delete(documentAnnotations)
          .where(eq(documentAnnotations.id, annotationId));
      },
    );
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Clear every markup on one page, or on the whole document. */
export async function clearAnnotations(
  documentId: string,
  pageNumber?: number,
): Promise<ActionResult<{ cleared: number }>> {
  const gate = await requireBusinessBuilder();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { profile } = gate;

  if (!z.string().uuid().safeParse(documentId).success) {
    return { ok: false, error: "Invalid document id." };
  }

  const engagementId = await resolveEngagementIdFromRecord(
    "documents",
    documentId,
  );
  if (!engagementId) return { ok: false, error: "Document not found." };

  try {
    const cleared = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const where =
          typeof pageNumber === "number"
            ? and(
                eq(documentAnnotations.documentId, documentId),
                eq(documentAnnotations.pageNumber, pageNumber),
              )
            : eq(documentAnnotations.documentId, documentId);
        const removed = await tx
          .delete(documentAnnotations)
          .where(where)
          .returning({ id: documentAnnotations.id });
        return removed.length;
      },
    );
    revalidatePath(`/business-builder/documents/${engagementId}`);
    return { ok: true, data: { cleared } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
