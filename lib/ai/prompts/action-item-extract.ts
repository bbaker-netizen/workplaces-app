/**
 * Action item extraction prompt.
 *
 * Phase 2.3. Used by the BBS-prep flow: feed in a Fireflies
 * transcript, get back proposed action items as JSON. Each item
 * carries a confidence flag so the Coach can quickly review +
 * publish vs edit + publish.
 */

export const ACTION_ITEM_EXTRACT_SYSTEM = `You are an expert Coach for Workplaces. Your job: read a Business Building Session transcript and extract every action item — owned, dated commitments — that came up.

Output STRICT JSON only. No prose, no markdown fences. The shape:

{
  "items": [
    {
      "title": "Short imperative verb-phrase",
      "description": "Optional 1–2 sentence detail",
      "assigneeName": "Display name of the person who took it on, exactly as they appear in the transcript",
      "dueDate": "YYYY-MM-DD or null",
      "revenueImpact": true | false,
      "marginImpact": true | false,
      "confidence": "high" | "medium" | "low"
    }
  ],
  "documents": [
    {
      "type": "one of: sop | org_chart | job_profile | financial_dashboard | onboarding_guide | operations_setup_guide | business_plan | marketing_plan | stages_of_growth_assessment",
      "title": "What this specific document should be called for this client",
      "reason": "One sentence: what in the session calls for it"
    }
  ]
}

Rules for "documents":
- These are the nine Workplaces deliverable types. Name only the ones THIS session actually calls for. Most sessions call for none, or one. Returning an empty array is the correct and common answer.
- Include one only when the session shows a real need: the client asked for it, a gap was identified that this document closes, or the work was explicitly agreed.
- Do NOT include a type just because the topic was mentioned in passing. Discussing hiring is not a job profile; agreeing to write up the role is.
- Never return more than 3. If more seem warranted, return the 3 the session most clearly asked for.
- The title should be specific to this client and this need, not the generic type name.
- A document is different from an action item. "Draft the SOP for job costing" is an action item AND an sop document; include it in both arrays in that case.

Rules for "items":
- Only include items that are clearly someone's commitment, not generic ideas or "we should think about" statements.
- "high" confidence: explicit "I'll do X by Friday" or equivalent.
- "medium": clear ownership but vague timing.
- "low": ambiguous — Coach should review carefully.
- revenueImpact / marginImpact: tag based on the Workplaces Quality Gate. If neither, flag confidence low — items that don't move revenue or margin shouldn't exist.
- assigneeName must be a real attendee from the transcript; null if unclear.
- dueDate: only include if explicitly stated or strongly implied. null otherwise.

Return ONLY the JSON object — no leading whitespace, no trailing text.`;

export function actionItemExtractUserPrompt(input: {
  meetingTitle: string;
  meetingDate: string;
  transcriptText: string;
}): string {
  return `Meeting: ${input.meetingTitle}
Date: ${input.meetingDate}

Transcript:

${input.transcriptText}

Extract the action items, and name any of the nine documents this session
calls for. JSON only.`;
}

/**
 * How much room the extractor gets to answer.
 *
 * Was 4,000, and that is what killed Jen's press on Crown and Ember's
 * 30 July session: an 81-minute conversation produced more commitments
 * than fitted, the model stopped mid-string, and `JSON.parse` failed
 * with `Unterminated string in JSON at position 2888`. The whole run
 * died — not one of the items it HAD written was kept, and nothing said
 * why.
 *
 * Exactly the fault the deliverable drafter hit on 2026-07-27, fixed
 * there and never applied here. Both paths now run inside a Netlify
 * Background Function with a 15-minute budget, so the wall-clock that
 * once justified a small cap is gone. 16,000 is roughly ten times the
 * longest real output measured (14 items ≈ 2,900 characters).
 */
export const ACTION_ITEM_EXTRACT_MAX_TOKENS = 16000;

/**
 * Unwrap the model's JSON and parse it, saying plainly when the reply
 * was cut off rather than letting a character offset stand in for a
 * diagnosis.
 *
 * Truncation is CHECKED, not inferred from the parse failing: a reply
 * stopped at the cap can still happen to be valid JSON, in which case
 * silently accepting it would drop the tail of the meeting without
 * anybody noticing — the worse of the two failures.
 *
 * Callers keep their own Zod schema; this only handles the fence and
 * the JSON, which is the part that was duplicated and identical.
 */
export function parseExtractorJson(
  text: string,
  stopReason: string | null,
): unknown {
  if (stopReason === "max_tokens") {
    throw new Error(
      "This session produced more than the extractor could return in one go, " +
        "so the reply was cut off and nothing was saved. Long sessions can do " +
        "this — press Draft again, and if it keeps happening the meeting may " +
        "need splitting.",
    );
  }
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `The extractor's reply wasn't valid JSON (${
        e instanceof Error ? e.message : String(e)
      }). Nothing was saved — press Draft to try again.`,
    );
  }
}
