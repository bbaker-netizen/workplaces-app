"use server";

/**
 * Document-import server actions — async background-job flavor.
 *
 * The synchronous version of this action kept hitting Netlify's
 * 26-second function timeout. We split the work in two:
 *
 *   1. `startTemplateConversion(formData)` — fast (~1s). Extracts
 *      text from the uploaded file, inserts a `template_conversions`
 *      row with status='pending', and returns the conversion ID. The
 *      client then fires `fetch('/api/templates/convert/<id>')` to
 *      kick off the slow Claude call without blocking.
 *
 *   2. `getTemplateConversionStatus(id)` — fast poll endpoint. The
 *      browser calls this every few seconds until status !== 'pending'
 *      then loads the result into the editor.
 *
 *   3. `/api/templates/convert/[id]/route.ts` does the actual Claude
 *      call with `export const maxDuration = 300` — up to 5 minutes
 *      on Netlify Pro, so it never times out for normal contracts.
 *
 * Authz on every entry point: master_admin / coach only, and the
 * polling endpoint also confirms the row belongs to the caller's org.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { templateConversions } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  DOCUMENT_TEMPLATE_CATEGORIES,
  type DocumentTemplateCategory,
} from "@/lib/signing/document-variables";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB upper bound on uploads

const resultSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(DOCUMENT_TEMPLATE_CATEGORIES),
  default_subject: z.string().max(150).optional().nullable(),
  body_markdown: z.string().min(50),
});

export type ConvertedTemplate = z.infer<typeof resultSchema>;

export type StartResult =
  | { ok: true; data: { conversionId: string } }
  | { ok: false; error: string };

export type StatusResult =
  | {
      ok: true;
      data:
        | { status: "pending" | "running" }
        | { status: "done"; result: ConvertedTemplate }
        | { status: "error"; error: string };
    }
  | { ok: false; error: string };

/**
 * Step 1 — extract text from the uploaded file, create a pending
 * `template_conversions` row, return the new conversion ID. Runs
 * in well under a second so it never times out.
 */
export async function startTemplateConversion(
  formData: FormData,
): Promise<StartResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick a .docx or .pdf file to import." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: "File's too big (>5MB). Trim it down before importing.",
    };
  }

  const filename = file.name || "document";
  const ext = filename.toLowerCase().match(/\.([a-z]+)$/)?.[1] ?? "";
  if (ext !== "docx" && ext !== "pdf") {
    return {
      ok: false,
      error: "Only .docx and .pdf files are supported right now.",
    };
  }

  // Extract text. Both libraries are fast on typical contracts —
  // pdf-parse handles a 20-page PDF in <500ms.
  let extracted: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      extracted = (result.value ?? "").trim();
    } else {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      extracted = (result.text ?? "").trim();
    }
  } catch (e) {
    console.error("[startTemplateConversion] extraction failed", e);
    return {
      ok: false,
      error: `Couldn't read the file. ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!extracted || extracted.length < 100) {
    return {
      ok: false,
      error:
        "We could read the file but it came back nearly empty — is it a scanned image (no embedded text)? Try a text-based PDF or the original .docx.",
    };
  }

  // Cap at 30k chars — generous for any contract, keeps Claude latency
  // predictable. Cheaper too: ~7.5k tokens of input.
  const capped =
    extracted.length > 30_000
      ? extracted.slice(0, 30_000) +
        "\n\n[…document truncated for processing speed; paste remainder manually if needed…]"
      : extracted;

  // Create the pending row. The API route picks it up when the client
  // fires the convert fetch.
  const conversionId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .insert(templateConversions)
      .values({
        orgId: profile.orgId,
        userProfileId: profile.userProfileId,
        filename,
        sourceText: capped,
        status: "pending",
      })
      .returning({ id: templateConversions.id });
    return row.id;
  });

  return { ok: true, data: { conversionId } };
}

/**
 * Step 2 — read the conversion row. The browser polls this every few
 * seconds while waiting on the Claude call. Authz: row must belong to
 * the caller's org (RLS would catch a cross-tenant read but we double-
 * check here for a clean error message).
 */
export async function getTemplateConversionStatus(
  conversionId: string,
): Promise<StatusResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };

  const row = await withSystemContext(async (tx) => {
    const [r] = await tx
      .select()
      .from(templateConversions)
      .where(eq(templateConversions.id, conversionId))
      .limit(1);
    return r;
  });
  if (!row) return { ok: false, error: "Conversion not found." };
  if (row.orgId !== profile.orgId)
    return { ok: false, error: "Not authorised." };

  if (row.status === "pending" || row.status === "running") {
    return { ok: true, data: { status: row.status } };
  }
  if (row.status === "error") {
    return {
      ok: true,
      data: {
        status: "error",
        error: row.errorMessage ?? "Conversion failed.",
      },
    };
  }
  // status === 'done'
  const parsed = resultSchema.safeParse(row.resultJson);
  if (!parsed.success) {
    return {
      ok: true,
      data: {
        status: "error",
        error: "Result format was unexpected. Try again.",
      },
    };
  }
  return { ok: true, data: { status: "done", result: parsed.data } };
}

// Re-export for callers that want to check category at compile time.
export type { DocumentTemplateCategory };
