/**
 * Reviewing a drafted session recap before it reaches a client.
 *
 * **Why this exists.** The EA drafts a client-facing recap after every
 * recorded session and emails the Business Builder an approve link. That
 * link sends the recap VERBATIM. Until this module, there was no way to
 * change a word first — `session_recaps` was rendered nowhere in the
 * app, so the only two options were "send exactly what the model wrote"
 * or "send nothing". For something that goes out over a coach's name to
 * a paying client, that is the wrong pair of options.
 *
 * Both actions here authorise through Clerk AND through
 * `canCurrentBbAccessEngagement`, so a Business Builder scoped to their
 * own book cannot edit or send another coach's client recap by pasting
 * an id. The approve-link path in `app/api/ea/approve/[token]` keeps its
 * own token-based authorisation and is untouched.
 */

"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { canCurrentBbAccessEngagement } from "@/lib/db/queries/bb-access";
import { sessionRecaps } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { approveSessionRecap } from "@/lib/ea/session-recap";
import { markdownToEmailHtml } from "@/lib/templates/markdown-to-html";

const editSchema = z.object({
  recapId: z.string().uuid(),
  engagementId: z.string().uuid(),
  subject: z.string().trim().min(1).max(300),
  bodyMarkdown: z.string().trim().min(1).max(50_000),
});

export type RecapActionResult = { ok: true } | { ok: false; error: string };

/**
 * `markdownToEmailHtml` returns a whole `<!DOCTYPE html>` document, but
 * `body_html` is embedded as a FRAGMENT inside the recap email's shell
 * (and inside the approve page's preview). Nesting a full document in a
 * table cell renders unpredictably across mail clients, so the wrapper
 * comes back off.
 */
function markdownToBodyFragment(md: string): string {
  const doc = markdownToEmailHtml(md);
  const inner = doc.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return inner ? inner[1] : doc;
}

/**
 * Save an edited recap.
 *
 * Markdown is what the Builder edits and what gets stored; the HTML and
 * plain-text bodies are DERIVED from it on every save. Storing an edit
 * to only one of the three would let the emailed copy and the copy filed
 * on the client's portal thread say different things — the portal
 * renders markdown, the email renders HTML, and they must not diverge.
 *
 * Draft-only. Once a recap is approved or sent, its text is the record
 * of what the client was told, and editing it afterwards would rewrite
 * history rather than correct it.
 */
export async function updateRecapDraft(
  input: z.infer<typeof editSchema>,
): Promise<RecapActionResult> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That recap could not be saved as written." };

  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Only a Business Builder can edit a recap." };
  }
  if (!(await canCurrentBbAccessEngagement(parsed.data.engagementId))) {
    return { ok: false, error: "That client is not in your book." };
  }

  const { recapId, engagementId, subject, bodyMarkdown } = parsed.data;

  const updated = await withSystemContext(async (tx) => {
    // Guarded on BOTH the engagement and `status = 'draft'`. The
    // engagement match stops an id from another client being written
    // through an engagement this caller does happen to hold; the status
    // match means a recap approved in another tab between load and save
    // is not silently overwritten.
    const rows = await tx
      .update(sessionRecaps)
      .set({
        subject,
        bodyMarkdown,
        bodyHtml: markdownToBodyFragment(bodyMarkdown),
        // Markdown doubles as the plain-text alternative. It is plain
        // text with light markup by design, so a text-only mail client
        // gets something readable rather than stripped-out HTML.
        bodyText: bodyMarkdown,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sessionRecaps.id, recapId),
          eq(sessionRecaps.engagementId, engagementId),
          eq(sessionRecaps.status, "draft"),
        ),
      )
      .returning({ id: sessionRecaps.id });
    return rows.length > 0;
  });

  if (!updated) {
    return {
      ok: false,
      error: "That recap is no longer a draft — it may already have been sent.",
    };
  }

  revalidatePath(`/business-builder/engagements/${engagementId}`, "layout");
  return { ok: true };
}

const discardSchema = z.object({
  recapId: z.string().uuid(),
  engagementId: z.string().uuid(),
});

/**
 * Decide against sending a recap, without touching the transcript.
 *
 * Bruce's ask: not every session warrants written notes, but the client
 * should still get the Fireflies transcript. Those were welded together
 * before — the recap was the only client-facing artefact you could act
 * on, and leaving it as an unsent draft meant a permanent "waiting for
 * review" against a session you had already decided about.
 *
 * **Marked, not deleted.** `lib/ea/recap-sweep.ts` decides what to draft
 * by asking whether a `session_recaps` row exists for the session, so a
 * hard delete frees the slot and the next hourly run drafts the same
 * recap again. The row stays and records the decision.
 *
 * Deliberately does NOT touch `engagement_meetings.transcript_shared_at`.
 * Sharing the transcript is a separate, separately-confirmed act, and
 * discarding notes must never quietly retract something the client can
 * already read — nor grant them something they cannot.
 *
 * Drafts only. A sent recap is the record of what a client was told; an
 * approved one is mid-flight. Neither is discardable.
 */
export async function discardRecapDraft(
  input: z.infer<typeof discardSchema>,
): Promise<RecapActionResult> {
  const parsed = discardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That recap could not be found." };

  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Only a Business Builder can discard a recap." };
  }
  if (!(await canCurrentBbAccessEngagement(parsed.data.engagementId))) {
    return { ok: false, error: "That client is not in your book." };
  }

  const { recapId, engagementId } = parsed.data;

  const discarded = await withSystemContext(async (tx) => {
    // and(), never `&&`. Drizzle conditions combined with `&&` collapse
    // to the LAST operand, which here would have discarded every draft
    // recap in the database. Nothing in tsc catches it — the types line
    // up perfectly. See the 2026-08-03 note in CLAUDE.md.
    const rows = await tx
      .update(sessionRecaps)
      .set({ status: "discarded", updatedAt: new Date() })
      .where(
        and(
          eq(sessionRecaps.id, recapId),
          eq(sessionRecaps.engagementId, engagementId),
          eq(sessionRecaps.status, "draft"),
        ),
      )
      .returning({ id: sessionRecaps.id });
    return rows.length > 0;
  });

  if (!discarded) {
    return {
      ok: false,
      error: "That recap is no longer a draft — it may already have been sent.",
    };
  }

  revalidatePath(`/business-builder/engagements/${engagementId}`, "layout");
  return { ok: true };
}

const sendSchema = z.object({
  recapId: z.string().uuid(),
  engagementId: z.string().uuid(),
});

export type RecapSendResult =
  | { ok: true; sentTo: number; clientLabel: string }
  | { ok: false; error: string };

/**
 * Approve and send a recap from inside the app.
 *
 * Delegates to `approveSessionRecap`, which is the same function the
 * emailed approve link calls — one send path, so the portal record, the
 * ordering guarantees and the "stamp sent_at only after delivery" rule
 * cannot drift between the two entry points.
 */
export async function sendRecapNow(
  input: z.infer<typeof sendSchema>,
): Promise<RecapSendResult> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Only a Business Builder can send a recap." };
  }
  if (!(await canCurrentBbAccessEngagement(parsed.data.engagementId))) {
    return { ok: false, error: "That client is not in your book." };
  }

  // Confirm the recap really belongs to the engagement just authorised.
  const belongs = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ engagementId: sessionRecaps.engagementId })
      .from(sessionRecaps)
      .where(eq(sessionRecaps.id, parsed.data.recapId))
      .limit(1);
    return row?.engagementId === parsed.data.engagementId;
  });
  if (!belongs) return { ok: false, error: "That recap no longer exists." };

  const result = await approveSessionRecap(
    parsed.data.recapId,
    profile.userProfileId,
  );
  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath(`/business-builder/engagements/${parsed.data.engagementId}`, "layout");
  return { ok: true, sentTo: result.sentTo, clientLabel: result.clientLabel };
}
