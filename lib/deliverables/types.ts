/**
 * Shared source of truth for the 9 Workplaces deliverable types and
 * their human labels. Used by the deliverables server actions, the
 * "draft from meeting" flow, and the session-detail type picker so the
 * list never drifts between surfaces.
 */

export const DELIVERABLE_TYPES = [
  "sop",
  "org_chart",
  "job_profile",
  "financial_dashboard",
  "onboarding_guide",
  "operations_setup_guide",
  "business_plan",
  "marketing_plan",
  "stages_of_growth_assessment",
] as const;

export type DeliverableType = (typeof DELIVERABLE_TYPES)[number];

export const DELIVERABLE_TYPE_LABEL: Record<DeliverableType, string> = {
  sop: "SOPs & process flows",
  org_chart: "Org chart",
  job_profile: "Job profile & interview guide",
  financial_dashboard: "Financial dashboard",
  onboarding_guide: "Onboarding guide",
  operations_setup_guide: "Operations setup guide",
  business_plan: "Business plan",
  marketing_plan: "Marketing plan",
  stages_of_growth_assessment: "Stages of growth assessment",
};

/**
 * The body a document row carries while its background draft is still
 * running.
 *
 * A sentinel rather than a loose string in one file, for the same reason
 * `TOMBSTONE_BODY` is one: two places need to agree on it — the writer
 * that creates the placeholder, and the review board that must NOT show
 * it as something to publish.
 *
 * Bruce hit exactly that. A document placeholder counted towards "1
 * draft landed below, ready for review" and rendered with an owner
 * picker, a due date and a Publish button, its body reading "…if this
 * message is still here after five minutes, the drafting job didn't run
 * — tell Bruce." A progress note presented as a reviewable commitment.
 */
export const DELIVERABLE_DRAFTING_PLACEHOLDER =
  "> _Reading the meeting transcript and drafting… this usually takes " +
  "a minute or two. If this message is still here after five minutes, " +
  "the drafting job didn't run — tell Bruce._";

/** True when this row is a document whose draft hasn't landed yet. */
export function isDraftingPlaceholder(
  description: string | null | undefined,
): boolean {
  return (description ?? "").trim() === DELIVERABLE_DRAFTING_PLACEHOLDER;
}
