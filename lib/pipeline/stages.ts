/**
 * Pipeline stage definitions — the CRM pipeline kanban-style stages.
 *
 * Mapped from the Workplaces Monday workspace pattern (Select / New
 * Lead / First Contact / Meeting Scheduled / Follow-Up / Negotiation
 * / Won / Lost) onto The Builder's prospect lifecycle:
 *
 *   new_lead            → just came in, no contact yet
 *   first_contact       → initial outreach done
 *   meeting_scheduled   → intro call booked
 *   diagnostic_complete → completed our diagnostic intake
 *   proposal_sent       → proposal delivered
 *   negotiation         → terms being negotiated
 *   contract_sent       → contract out for signature
 *   contract_signed     → fully signed
 *   onboarded           → engagement provisioned, active client
 *   lost                → didn't close
 *
 * Each stage carries a label, a one-line description, and a TBB-palette
 * colour pair (text/background). Colours echo Bruce's Monday board
 * conventions but adapted to the Business Builder palette.
 */

import type { prospectStatusEnum } from "@/lib/db/schema";

export type ProspectStatus =
  (typeof prospectStatusEnum.enumValues)[number];

export type StageStyle = {
  label: string;
  caption: string;
  /** Tailwind classes for a chip/pill rendering of the stage. */
  chipClass: string;
  /** Tailwind text colour for inline accents. */
  textClass: string;
};

export const STAGE_STYLES: Record<ProspectStatus, StageStyle> = {
  new_lead: {
    label: "New lead",
    caption: "Just came in",
    chipClass: "bg-tbb-blue-light-200 text-tbb-navy",
    textClass: "text-tbb-navy",
  },
  diagnostic_pending: {
    label: "Diagnostic pending",
    caption: "Started but didn't finish",
    chipClass: "bg-tbb-cream-200 text-tbb-navy",
    textClass: "text-tbb-navy",
  },
  first_contact: {
    label: "First contact",
    caption: "Initial outreach done",
    chipClass: "bg-tbb-blue-light text-white",
    textClass: "text-tbb-blue-light",
  },
  meeting_scheduled: {
    label: "Meeting scheduled",
    caption: "Intro call booked",
    chipClass: "bg-tbb-blue text-white",
    textClass: "text-tbb-blue",
  },
  diagnostic_complete: {
    label: "Diagnostic complete",
    caption: "Filled out our diagnostic",
    chipClass: "bg-tbb-blue-100 text-tbb-blue-700",
    textClass: "text-tbb-blue-700",
  },
  proposal_sent: {
    label: "Proposal sent",
    caption: "Awaiting response",
    chipClass: "bg-tbb-navy text-white",
    textClass: "text-tbb-navy",
  },
  negotiation: {
    label: "Negotiation",
    caption: "Terms being worked out",
    chipClass: "bg-tbb-warning text-white",
    textClass: "text-tbb-warning",
  },
  contract_sent: {
    label: "Contract sent",
    caption: "Out for signature",
    chipClass: "bg-tbb-warning text-tbb-navy",
    textClass: "text-tbb-warning",
  },
  contract_signed: {
    label: "Contract signed",
    caption: "Won — ready to onboard",
    chipClass: "bg-tbb-success text-white",
    textClass: "text-tbb-success",
  },
  onboarded: {
    label: "Onboarded",
    caption: "Active engagement",
    chipClass: "bg-tbb-success text-white",
    textClass: "text-tbb-success",
  },
  lost: {
    label: "Lost",
    caption: "Didn't close",
    chipClass: "bg-tbb-danger text-white",
    textClass: "text-tbb-danger",
  },
};

/**
 * Pipeline order for kanban / grouped views. Active stages first;
 * closed (won / lost) at the end.
 */
export const STAGE_ORDER: ProspectStatus[] = [
  "new_lead",
  "first_contact",
  "meeting_scheduled",
  "diagnostic_complete",
  "diagnostic_pending",
  "proposal_sent",
  "negotiation",
  "contract_sent",
  "contract_signed",
  "onboarded",
  "lost",
];

/** Common lead-source values for the dropdown. */
export const LEAD_SOURCES = [
  "Web diagnostic",
  "Referral",
  "Cold outreach",
  "Networking event",
  "Inbound email",
  "Phone call",
  "Social media",
  "Conference",
  "Other",
] as const;

/** Activity types for the timeline. */
export const ACTIVITY_TYPES = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "note", label: "Note" },
  { value: "stage_change", label: "Stage change" },
  { value: "web_lead", label: "Web lead" },
  { value: "signature_request", label: "Signature sent" },
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

export function activityTypeLabel(type: string): string {
  return ACTIVITY_TYPES.find((t) => t.value === type)?.label ?? type;
}
