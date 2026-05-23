"use server";

/**
 * Convert an uploaded .docx or .pdf into a Workplaces document
 * template. Same workflow Bruce was doing manually via Claude Code:
 *
 *   1. Extract plain text from the file.
 *   2. Send the extracted text to Claude with a system prompt that
 *      knows the supported variable placeholders.
 *   3. Claude returns structured markdown with {{variables}} woven
 *      in plus a suggested template name + category + default
 *      subject.
 *
 * Caller (the templates UI) takes the result and pre-fills the
 * template editor. Bruce reviews, edits, hits Save.
 *
 * Authz: master_admin / coach only.
 *
 * Failure modes: file >5MB → rejected. Unsupported format →
 * rejected. Extraction error → returns error string. Claude
 * failure → returns error string. All best-effort; nothing is
 * written to the DB by this action — the existing
 * createDocumentTemplate action handles the persisted insert
 * after Bruce confirms.
 */

import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { complete } from "@/lib/ai/anthropic";
import {
  DOCUMENT_TEMPLATE_CATEGORIES,
  DOCUMENT_VARIABLES,
} from "@/lib/signing/document-variables";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB upper bound on uploads

const SYSTEM_PROMPT = `You convert legal / business documents (contracts, NDAs, proposals, renewals, agreements) into Workplaces "document templates" — markdown bodies with {{variable}} placeholders that get auto-filled when the coach sends them for signature.

The supported variables are:

${DOCUMENT_VARIABLES.map((v) => `- {{${v.name}}} — ${v.description}`).join("\n")}

Output requirements:

- Use only the markdown subset the renderer supports:
  * # / ## / ### headings
  * **bold** (no italics, no underline, no strike)
  * paragraphs separated by blank lines
  * - bullet lists (no numbered lists; convert numbered lists to bullets)
  * No tables. No images. No links. No HTML. No code fences.

- Wherever the source document has a placeholder for the client's name, company, dates, fees, or other tenant-specific values, REPLACE that placeholder with the matching {{variable}}. If a placeholder doesn't map to a known variable, leave it as a square-bracketed marker like [monthly fee] or [phone number] — those become visible "fill this in" prompts in the rendered PDF.

- Preserve every substantive clause and the document's overall structure. Do not summarise, paraphrase aggressively, or remove legal language. The goal is to make the document reusable, not shorter.

- If the document has an "Accelerator Program" + "Implementer Program" choice (the standard Workplaces BBA pattern), use {{accelerator_checkbox}} and {{implementer_checkbox}} so the marked program renders as [X] and the unmarked as [ ].

- Do NOT include a signature block in the body. The signing flow appends a Certificate of Completion with signatures automatically.

- The sender (Workplaces side) is always referred to via {{sender_full_name}}, {{sender_email}}. The "client" placeholder values use {{client_full_name}}, {{company_name}}, {{contact_email}}.

Output strict JSON only — no prose, no code fences:

{
  "name": "Short reference name (max 80 chars). Use the document's title or a descriptive label.",
  "category": "one of: contract, proposal, nda, renewal, other",
  "default_subject": "What the signer email subject should say (max 100 chars)",
  "body_markdown": "the full markdown body, properly substituted"
}`;

const resultSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(DOCUMENT_TEMPLATE_CATEGORIES),
  default_subject: z.string().max(150).optional().nullable(),
  body_markdown: z.string().min(50),
});

export type ConvertedTemplate = z.infer<typeof resultSchema>;

export type ConvertResult =
  | { ok: true; data: ConvertedTemplate }
  | { ok: false; error: string };

export async function convertDocumentToTemplate(
  formData: FormData,
): Promise<ConvertResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error:
        "ANTHROPIC_API_KEY isn't set on the server. Conversion needs Claude.",
    };
  }

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

  // 1. Extract text from the file.
  let extracted: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      extracted = (result.value ?? "").trim();
    } else {
      // pdf-parse
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      extracted = (result.text ?? "").trim();
    }
  } catch (e) {
    console.error("[convertDocumentToTemplate] extraction failed", e);
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

  // Cap the input — Netlify serverless functions have hard timeouts
  // (10-60s depending on plan), so we trim aggressively. Most legal
  // documents fit in 30k chars (≈8k words); anything larger gets
  // sliced and the user can paste the rest into the editor manually.
  const capped =
    extracted.length > 30_000
      ? extracted.slice(0, 30_000) + "\n\n[…document truncated for processing speed; paste remainder manually if needed…]"
      : extracted;

  // 2. Run Claude to produce the markdown template.
  //
  // We use Haiku (the fast Claude variant) here instead of Sonnet —
  // contract conversion is a mostly mechanical "clean up + substitute
  // placeholders" task, well within Haiku's capability, and Haiku runs
  // 3-5x faster (typically 5-12 seconds vs 20-40s for Sonnet). The
  // latency budget matters: Netlify caps synchronous server actions
  // at 10s on Free, 26s on Pro, 60s on Enterprise — Sonnet was sitting
  // right at the edge of the Pro budget.
  let json: unknown;
  try {
    const result = await complete({
      system: SYSTEM_PROMPT,
      user: `Source document filename: ${filename}\n\nExtracted text:\n\n${capped}`,
      model: "claude-haiku-4-5-20251001",
      // 6000 tokens covers a 4-5 page contract comfortably; lowering
      // from the previous 8000 ceiling reduces tail latency on
      // serverless and rarely matters because contracts cap there.
      maxTokens: 6000,
      temperature: 0.2,
    });
    const cleaned = result.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    json = JSON.parse(cleaned);
  } catch (e) {
    console.error("[convertDocumentToTemplate] Claude failed", e);
    return {
      ok: false,
      error: `Claude couldn't convert the document. ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const parsed = resultSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Claude returned an unexpected shape: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
    };
  }

  return { ok: true, data: parsed.data };
}
