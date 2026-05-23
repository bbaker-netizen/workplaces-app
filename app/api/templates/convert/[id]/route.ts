/**
 * POST /api/templates/convert/[id]
 *
 * Background-job worker for the document-import flow. The client
 * uploads a file → `startTemplateConversion` extracts text and
 * creates a pending row → client fires fetch to this route (without
 * awaiting) → this route does the Claude conversion and updates the
 * row. Client polls `getTemplateConversionStatus(id)` until done.
 *
 * `export const maxDuration = 300` extends the timeout to 5 minutes
 * on Netlify Pro (the @netlify/plugin-nextjs honors this on Route
 * Handlers). Cold start + Claude conversion typically totals 8-20s
 * for a normal contract, so we have huge headroom.
 *
 * Auth: the row's `org_id` must match the caller's Clerk org. We
 * don't accept any Claude prompt input from the client — the prompt
 * is baked into this route and operates on the `source_text` we
 * persisted server-side during the kickoff action.
 */

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { templateConversions } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { complete } from "@/lib/ai/anthropic";
import {
  DOCUMENT_TEMPLATE_CATEGORIES,
  DOCUMENT_VARIABLES,
} from "@/lib/signing/document-variables";
import { z } from "zod";

// Up to 5 minutes — Netlify's Next.js plugin reads this and bumps the
// Lambda timeout accordingly. On Free this caps at 10s; on Pro this
// can extend to 300s.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You convert legal / business documents (contracts, NDAs, proposals, renewals, agreements) into Workplaces "document templates" — markdown bodies with {{variable}} placeholders that get auto-filled when the Coach sends them for signature.

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

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const conversionId = params.id;
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return NextResponse.json(
      { ok: false, error: "Not authenticated." },
      { status: 401 },
    );
  }

  // Load the pending row.
  const row = await withSystemContext(async (tx) => {
    const [r] = await tx
      .select()
      .from(templateConversions)
      .where(eq(templateConversions.id, conversionId))
      .limit(1);
    return r;
  });
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "Conversion not found." },
      { status: 404 },
    );
  }
  if (row.orgId !== profile.orgId) {
    return NextResponse.json(
      { ok: false, error: "Not authorised." },
      { status: 403 },
    );
  }
  if (row.status !== "pending") {
    // Idempotent — if the client fires this twice (e.g. double-click),
    // the second invocation is a no-op.
    return NextResponse.json({ ok: true, data: { status: row.status } });
  }

  // Mark as running before calling Claude.
  await withSystemContext(async (tx) => {
    await tx
      .update(templateConversions)
      .set({ status: "running" })
      .where(eq(templateConversions.id, conversionId));
  });

  if (!process.env.ANTHROPIC_API_KEY) {
    await markError(conversionId, "ANTHROPIC_API_KEY isn't set on the server.");
    return NextResponse.json(
      { ok: false, error: "Server missing ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  try {
    const claude = await complete({
      system: SYSTEM_PROMPT,
      user: `Source document filename: ${row.filename ?? "document"}\n\nExtracted text:\n\n${row.sourceText}`,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 6000,
      temperature: 0.2,
    });
    const cleaned = claude.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const json = JSON.parse(cleaned);
    const parsed = resultSchema.safeParse(json);
    if (!parsed.success) {
      await markError(
        conversionId,
        `Claude returned an unexpected shape: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
      );
      return NextResponse.json({ ok: false }, { status: 422 });
    }
    await withSystemContext(async (tx) => {
      await tx
        .update(templateConversions)
        .set({
          status: "done",
          resultJson: parsed.data,
          completedAt: new Date(),
        })
        .where(eq(templateConversions.id, conversionId));
    });
    return NextResponse.json({ ok: true, data: { status: "done" } });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
    await markError(conversionId, `Claude conversion failed: ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

async function markError(conversionId: string, message: string): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx
      .update(templateConversions)
      .set({
        status: "error",
        errorMessage: message.slice(0, 4000),
        completedAt: new Date(),
      })
      .where(eq(templateConversions.id, conversionId));
  });
}
