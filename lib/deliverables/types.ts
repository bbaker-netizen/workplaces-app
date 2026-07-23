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
