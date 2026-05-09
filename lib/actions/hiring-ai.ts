"use server";

/**
 * Hiring Pipeline — AI Generate buttons.
 *
 * Phase 2.1. Each action:
 *   1. Reads the candidate + linked documents (gap report, resume).
 *   2. Calls Anthropic via `lib/ai/anthropic.ts` with the matching
 *      prompt template from `lib/ai/prompts/hiring.ts`.
 *   3. Persists the result onto the candidate's `notes` field
 *      (markdown body, appended with a section header). Phase 2 will
 *      separate AI-generated artifacts into their own table; for now
 *      they live in notes so existing UI surfaces them.
 *
 * Document text extraction: gap_report and resume PDFs are extracted
 * via the existing `downloadDocumentBlob` helper. PDF text extraction
 * itself uses `pdf-parse` (added as a dep in this phase).
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { documents, hires, type UserProfile } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";
import { complete } from "@/lib/ai/anthropic";
import {
  GAP_ANALYSIS_SYSTEM,
  HIRING_ASSESSMENT_SYSTEM,
  INTERVIEW_GUIDE_SYSTEM,
  ONBOARDING_PACK_SYSTEM,
  gapAnalysisUserPrompt,
  hiringAssessmentUserPrompt,
  interviewGuideUserPrompt,
  onboardingPackUserPrompt,
} from "@/lib/ai/prompts/hiring";
import { downloadDocumentBlob } from "@/lib/storage/blobs";
import { extractPdfText } from "@/lib/ai/pdf";

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

async function loadHireWithDocs(
  hireId: string,
  callerOrgId: string,
  callerRole: Role,
) {
  const engagementId = await resolveEngagementIdFromRecord("hires", hireId);
  if (!engagementId) return null;
  return withEngagementContext(
    callerOrgId,
    callerRole,
    engagementId,
    async (tx) => {
      const [hire] = await tx
        .select()
        .from(hires)
        .where(eq(hires.id, hireId))
        .limit(1);
      if (!hire) return null;
      const docIds = [
        hire.gapReportDocumentId,
        hire.resumeDocumentId,
      ].filter((v): v is string => !!v);
      const allDocs = [];
      for (const id of docIds) {
        const [d] = await tx
          .select()
          .from(documents)
          .where(eq(documents.id, id))
          .limit(1);
        if (d) allDocs.push(d);
      }
      return { hire, docs: allDocs };
    },
  );
}

async function readDocumentText(
  blobKey: string,
  fileType: string,
): Promise<string> {
  const blob = await downloadDocumentBlob(blobKey);
  if (!blob) return "";
  if (fileType === "application/pdf") {
    return extractPdfText(blob.body);
  }
  // Plain-text fallback: assume utf-8 for any non-PDF document.
  return new TextDecoder("utf-8").decode(blob.body);
}

async function appendNoteToHire(
  hireId: string,
  callerOrgId: string,
  callerRole: Role,
  sectionHeader: string,
  body: string,
): Promise<void> {
  const engagementId = await resolveEngagementIdFromRecord("hires", hireId);
  if (!engagementId) throw new Error("Hire not found.");
  await withEngagementContext(
    callerOrgId,
    callerRole,
    engagementId,
    async (tx) => {
      const [existing] = await tx
        .select({ notes: hires.notes })
        .from(hires)
        .where(eq(hires.id, hireId))
        .limit(1);
      const stamp = new Date().toLocaleString();
      const block = `\n\n---\n\n## ${sectionHeader}\n*Generated ${stamp}*\n\n${body}`;
      await tx
        .update(hires)
        .set({ notes: (existing?.notes ?? "") + block })
        .where(eq(hires.id, hireId));
    },
  );
}

const idSchema = z.string().uuid();

/* ----------------------------- gap analysis ----------------------------- */

export async function generateGapAnalysis(
  hireId: string,
): Promise<ActionResult<{ result: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't run gap analysis." };
  if (!idSchema.safeParse(hireId).success)
    return { ok: false, error: "Invalid id." };

  const loaded = await loadHireWithDocs(hireId, profile.orgId, profile.role);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const gapReport = loaded.docs.find(
    (d) => d.id === loaded.hire.gapReportDocumentId,
  );
  if (!gapReport)
    return {
      ok: false,
      error: "Attach a TTI gap report to this candidate first.",
    };

  try {
    const gapText = await readDocumentText(
      gapReport.blobKey,
      gapReport.fileType,
    );
    if (!gapText.trim())
      return {
        ok: false,
        error: "Could not extract text from the gap report file.",
      };

    const result = await complete({
      system: GAP_ANALYSIS_SYSTEM,
      user: gapAnalysisUserPrompt({
        candidateName: loaded.hire.candidateName,
        roleName: loaded.hire.roleName,
        gapReportText: gapText.slice(0, 100_000),
      }),
      model: "claude-sonnet-4-6",
      maxTokens: 6000,
    });

    await appendNoteToHire(
      hireId,
      profile.orgId,
      profile.role,
      "Gap analysis",
      result.text,
    );
    revalidatePath(`/portal/hiring/${hireId}`);
    return { ok: true, data: { result: result.text } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ----------------------------- interview guide ----------------------------- */

export async function generateInterviewGuide(
  hireId: string,
): Promise<ActionResult<{ result: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't generate interview guides." };
  if (!idSchema.safeParse(hireId).success)
    return { ok: false, error: "Invalid id." };

  const loaded = await loadHireWithDocs(hireId, profile.orgId, profile.role);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const gapReport = loaded.docs.find(
    (d) => d.id === loaded.hire.gapReportDocumentId,
  );
  const resume = loaded.docs.find(
    (d) => d.id === loaded.hire.resumeDocumentId,
  );
  if (!gapReport)
    return {
      ok: false,
      error: "Attach a TTI gap report to this candidate first.",
    };

  try {
    const [gapText, resumeText] = await Promise.all([
      readDocumentText(gapReport.blobKey, gapReport.fileType),
      resume ? readDocumentText(resume.blobKey, resume.fileType) : "",
    ]);

    const result = await complete({
      system: INTERVIEW_GUIDE_SYSTEM,
      user: interviewGuideUserPrompt({
        candidateName: loaded.hire.candidateName,
        roleName: loaded.hire.roleName,
        gapReportText: gapText.slice(0, 100_000),
        resumeText: resumeText.slice(0, 50_000),
      }),
      model: "claude-sonnet-4-6",
      maxTokens: 6000,
    });

    await appendNoteToHire(
      hireId,
      profile.orgId,
      profile.role,
      "Interview guide",
      result.text,
    );
    revalidatePath(`/portal/hiring/${hireId}`);
    return { ok: true, data: { result: result.text } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ----------------------------- hiring assessment ----------------------------- */

export async function generateHiringAssessment(
  hireId: string,
  interviewTranscript: string,
): Promise<ActionResult<{ result: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't run hiring assessment." };
  if (!idSchema.safeParse(hireId).success)
    return { ok: false, error: "Invalid id." };
  if (!interviewTranscript || interviewTranscript.trim().length < 100)
    return {
      ok: false,
      error: "Paste the interview transcript first.",
    };

  const loaded = await loadHireWithDocs(hireId, profile.orgId, profile.role);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const gapReport = loaded.docs.find(
    (d) => d.id === loaded.hire.gapReportDocumentId,
  );
  if (!gapReport)
    return {
      ok: false,
      error: "Attach a TTI gap report to this candidate first.",
    };

  try {
    const gapText = await readDocumentText(
      gapReport.blobKey,
      gapReport.fileType,
    );
    const result = await complete({
      system: HIRING_ASSESSMENT_SYSTEM,
      user: hiringAssessmentUserPrompt({
        candidateName: loaded.hire.candidateName,
        roleName: loaded.hire.roleName,
        gapReportText: gapText.slice(0, 100_000),
        interviewTranscript: interviewTranscript.slice(0, 200_000),
      }),
      model: "claude-sonnet-4-6",
      maxTokens: 6000,
    });

    await appendNoteToHire(
      hireId,
      profile.orgId,
      profile.role,
      "Hiring assessment",
      result.text,
    );
    revalidatePath(`/portal/hiring/${hireId}`);
    return { ok: true, data: { result: result.text } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ----------------------------- onboarding pack ----------------------------- */

export async function generateOnboardingPack(
  hireId: string,
  startDate?: string,
  compensation?: string,
): Promise<ActionResult<{ result: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't generate onboarding." };
  if (!idSchema.safeParse(hireId).success)
    return { ok: false, error: "Invalid id." };

  const loaded = await loadHireWithDocs(hireId, profile.orgId, profile.role);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const gapReport = loaded.docs.find(
    (d) => d.id === loaded.hire.gapReportDocumentId,
  );
  if (!gapReport)
    return {
      ok: false,
      error: "Attach a TTI gap report to this candidate first.",
    };

  try {
    const gapText = await readDocumentText(
      gapReport.blobKey,
      gapReport.fileType,
    );
    const result = await complete({
      system: ONBOARDING_PACK_SYSTEM,
      user: onboardingPackUserPrompt({
        candidateName: loaded.hire.candidateName,
        roleName: loaded.hire.roleName,
        gapReportText: gapText.slice(0, 100_000),
        startDate,
        compensation,
      }),
      model: "claude-opus-4-7",
      maxTokens: 8000,
    });

    await appendNoteToHire(
      hireId,
      profile.orgId,
      profile.role,
      "Onboarding pack",
      result.text,
    );
    revalidatePath(`/portal/hiring/${hireId}`);
    return { ok: true, data: { result: result.text } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
