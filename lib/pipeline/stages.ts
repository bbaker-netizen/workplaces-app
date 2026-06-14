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
 * conventions but adapted to the Coach palette.
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
  /** Explicit hex colour for the small status dot on summary chips.
   *  Used as inline CSS so it can't be purged out of the bundle.
   *  Lifted from the same heritage palette as chipClass. */
  dotHex: string;
};

export const STAGE_STYLES: Record<ProspectStatus, StageStyle> = {
  new_lead: {
    label: "New lead",
    caption: "Fresh off the truck",
    chipClass: "bg-tbb-blue-light-200 text-tbb-navy",
    textClass: "text-tbb-navy",
    dotHex: "#9CA3AF", // neutral grey — un-touched lead
  },
  // diagnostic_pending was a stage but is really an action (send the
  // diagnostic from the prospect detail page). Style kept for any
  // legacy rows still carrying the value; STAGE_ORDER below omits it
  // so it never appears as a selectable option.
  diagnostic_pending: {
    label: "Diagnostic sent",
    caption: "Ball's in their court",
    chipClass: "bg-tbb-cream-200 text-tbb-navy",
    textClass: "text-tbb-navy",
    dotHex: "#D89F2F", // warning yellow — waiting on them
  },
  first_contact: {
    label: "First contact",
    caption: "Hello said",
    chipClass: "bg-tbb-blue-light text-white",
    textClass: "text-tbb-blue-light",
    dotHex: "#E59568", // light orange
  },
  meeting_scheduled: {
    label: "Meeting scheduled",
    caption: "On the books",
    chipClass: "bg-tbb-blue text-white",
    textClass: "text-tbb-blue",
    dotHex: "#CC6A20", // safety vest orange
  },
  diagnostic_complete: {
    label: "Diagnostic complete",
    caption: "Their cards on the table",
    chipClass: "bg-tbb-blue-100 text-tbb-blue-700",
    textClass: "text-tbb-blue-700",
    dotHex: "#9C4A0E", // deep orange
  },
  proposal_sent: {
    label: "Proposal sent",
    caption: "Now we wait. Briefly.",
    chipClass: "bg-tbb-navy text-white",
    textClass: "text-tbb-navy",
    dotHex: "#2E4057", // steel blue
  },
  negotiation: {
    label: "Negotiation",
    caption: "Last yard before the goal line",
    chipClass: "bg-tbb-warning text-white",
    textClass: "text-tbb-warning",
    dotHex: "#D89F2F", // amber
  },
  contract_sent: {
    label: "Contract sent",
    caption: "Pen's in their hand",
    chipClass: "bg-tbb-warning text-tbb-navy",
    textClass: "text-tbb-warning",
    dotHex: "#D89F2F", // amber
  },
  contract_signed: {
    label: "Contract signed",
    caption: "Won. Crack one open.",
    chipClass: "bg-tbb-success text-white",
    textClass: "text-tbb-success",
    dotHex: "#2E8B57", // success green
  },
  onboarded: {
    label: "Active engagement",
    caption: "Live and building",
    chipClass: "bg-tbb-success text-white",
    textClass: "text-tbb-success",
    dotHex: "#1F6B41", // deeper green
  },
  lost: {
    label: "Lost",
    caption: "Not this time",
    chipClass: "bg-tbb-danger text-white",
    textClass: "text-tbb-danger",
    dotHex: "#C0392B", // danger red
  },
};

/**
 * Pipeline order — the six working stages (+ Lost) after the Wave B
 * collapse. Retired stages (meeting_scheduled, diagnostic_pending,
 * diagnostic_complete, negotiation) keep their STAGE_STYLES entries so
 * any legacy reference still renders, but they're omitted here so they
 * never appear as a selectable stage. Migration 0050 remaps existing
 * rows off them.
 */
export const STAGE_ORDER: ProspectStatus[] = [
  "new_lead",
  "first_contact",
  "proposal_sent",
  "contract_sent",
  "contract_signed",
  "onboarded",
  "lost",
];

/** Common lead-source values for the dropdown. */
export const LEAD_SOURCES = [
  "Web diagnostic",
  "Referral",
  "Repeat Client",
  "Google Ads Campaign",
  "Google Search",
  "Cold outreach",
  "Networking event",
  "Inbound email",
  "Phone call",
  "Social media",
  "Conference",
] as const;

/**
 * Stages where the "Send diagnostic" action is offered. The diagnostic is
 * an early-qualification tool, so it's only shown for new leads / prospects
 * who haven't progressed past the diagnostic step (diagnostic_pending is
 * included so it can be re-sent). Once they're further down the funnel the
 * button drops off the prospect page.
 */
export const DIAGNOSTIC_ELIGIBLE_STAGES: readonly ProspectStatus[] = [
  "new_lead",
  "first_contact",
  // Retained for legacy rows that predate the Wave B collapse.
  "meeting_scheduled",
  "diagnostic_pending",
];

export function canSendDiagnostic(status: ProspectStatus): boolean {
  return DIAGNOSTIC_ELIGIBLE_STAGES.includes(status);
}

/** Activity types the coach can pick when manually logging an entry. */
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

/**
 * Display labels for system-generated activity types that aren't in the
 * manual-log dropdown but still appear on the timeline (stamped by actions
 * like Send diagnostic and Link QuickBooks customer).
 */
const SYSTEM_ACTIVITY_LABELS: Record<string, string> = {
  diagnostic_sent: "Diagnostic sent",
  qbo_linked: "QuickBooks linked",
};

export function activityTypeLabel(type: string): string {
  return (
    ACTIVITY_TYPES.find((t) => t.value === type)?.label ??
    SYSTEM_ACTIVITY_LABELS[type] ??
    type
  );
}
