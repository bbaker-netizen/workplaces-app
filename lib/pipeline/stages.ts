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
  contact_attempted: {
    label: "Contact attempt",
    caption: "Reached out — waiting to hear back",
    chipClass: "bg-tbb-cream-200 text-tbb-navy",
    textClass: "text-tbb-navy",
    dotHex: "#C9A66B", // warm tan
  },
  first_contact: {
    label: "First contact",
    caption: "Hello said",
    chipClass: "bg-tbb-blue-light text-white",
    textClass: "text-tbb-blue-light",
    dotHex: "#E59568", // light orange
  },
  meeting_scheduled: {
    label: "Appt booked",
    caption: "On the books",
    chipClass: "bg-tbb-blue text-white",
    textClass: "text-tbb-blue",
    dotHex: "#CC6A20", // safety vest orange
  },
  appt_completed_followup: {
    label: "Appt complete",
    caption: "Met — needs a follow-up",
    chipClass: "bg-tbb-blue-100 text-tbb-blue-700",
    textClass: "text-tbb-blue-700",
    dotHex: "#9C4A0E", // deep orange
  },
  // diagnostic_pending / diagnostic_complete are retired — remapped by
  // migration 0070. Styles kept only so the Record stays exhaustive for
  // any stragglers; STAGE_ORDER omits them.
  diagnostic_pending: {
    label: "Contact attempted",
    caption: "Ball's in their court",
    chipClass: "bg-tbb-cream-200 text-tbb-navy",
    textClass: "text-tbb-navy",
    dotHex: "#C9A66B",
  },
  diagnostic_complete: {
    label: "First contact made",
    caption: "Their cards on the table",
    chipClass: "bg-tbb-blue-light text-white",
    textClass: "text-tbb-blue-light",
    dotHex: "#E59568",
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
    label: "Won",
    caption: "Won. Live and building.",
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
  not_qualified: {
    label: "Not qualified",
    caption: "Not a fit",
    chipClass: "bg-tbb-cream-200 text-tbb-ink-3",
    textClass: "text-tbb-ink-3",
    dotHex: "#808080", // neutral grey
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
  "contact_attempted",
  "first_contact", // "First contact made"
  "meeting_scheduled", // "Appt booked"
  "appt_completed_followup",
  "proposal_sent",
  "contract_sent",
  "contract_signed",
  "onboarded", // "Won"
  "lost",
  "not_qualified",
];

/**
 * Coarse pipeline phase, used to drive what the prospect detail page shows.
 * Early leads stay lean; QuickBooks / Convert / Signing only surface once
 * the deal is far enough along to need them.
 */
export type ProspectPhase = "lead" | "qualifying" | "closing" | "won" | "lost";

export function prospectPhase(status: ProspectStatus): ProspectPhase {
  switch (status) {
    case "new_lead":
    case "contact_attempted":
    case "first_contact":
    case "diagnostic_pending":
    case "diagnostic_complete":
      return "lead";
    case "meeting_scheduled":
    case "appt_completed_followup":
    case "proposal_sent":
    case "negotiation":
      return "qualifying";
    case "contract_sent":
    case "contract_signed":
      return "closing";
    case "onboarded":
      return "won";
    case "lost":
    case "not_qualified":
      return "lost";
    default:
      return "lead";
  }
}

/** Common lead-source values for the dropdown. */
export const LEAD_SOURCES = [
  // Automatic channels — written verbatim by the Make scenarios that
  // POST to /api/leads, so these MUST match the source string each
  // scenario sends (e.g. the Meta scenario sends "Facebook Ads").
  "Facebook Ads",
  "Website Form",
  // Manual / mixed channels.
  "Referral",
  "Repeat Client",
  "Google Ads Campaign",
  "Google Search",
  "LinkedIn",
  "Networking event",
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
  follow_up: "Follow-up",
};

export function activityTypeLabel(type: string): string {
  return (
    ACTIVITY_TYPES.find((t) => t.value === type)?.label ??
    SYSTEM_ACTIVITY_LABELS[type] ??
    type
  );
}
