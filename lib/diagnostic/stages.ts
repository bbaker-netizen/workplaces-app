/**
 * Workplaces Stages of Growth — ORIGINAL Workplaces content.
 *
 * Seven stages a business moves through as it grows in people and
 * complexity. The stage is determined by team size (a factual anchor).
 * All names and copy here are Workplaces' own and can be renamed freely.
 *
 * Used by the public diagnostic (/diagnostic) as a prospect conversion
 * tool: answer a few questions → land on your stage → see what's likely
 * breaking and what to build next.
 */

export type StageKey =
  | "founder_operator"
  | "hands_on_team"
  | "stretched_owner"
  | "building_machine"
  | "professionalizing"
  | "scaling_engine"
  | "self_sustaining";

export type Stage = {
  key: StageKey;
  num: number;
  name: string;
  band: string;
  /** One line: what this stage looks like. */
  defines: string;
  /** One line: what usually breaks here. */
  breaks: string;
  /** One line: what to build next to move forward. */
  next: string;
};

/** Team-size options shown in the form; each maps to a stage. */
export const TEAM_SIZE_BANDS: ReadonlyArray<{
  value: string;
  label: string;
  stage: StageKey;
}> = [
  { value: "1-3", label: "Just me / 1–3 people", stage: "founder_operator" },
  { value: "4-10", label: "4–10 people", stage: "hands_on_team" },
  { value: "11-20", label: "11–20 people", stage: "stretched_owner" },
  { value: "21-40", label: "21–40 people", stage: "building_machine" },
  { value: "41-75", label: "41–75 people", stage: "professionalizing" },
  { value: "76-150", label: "76–150 people", stage: "scaling_engine" },
  { value: "150+", label: "More than 150 people", stage: "self_sustaining" },
];

export const STAGES: Record<StageKey, Stage> = {
  founder_operator: {
    key: "founder_operator",
    num: 1,
    name: "Founder-Operator",
    band: "1–3 people",
    defines:
      "You are the business — sales, delivery, and admin all run through you.",
    breaks:
      "Growth is capped by your own hours, and nothing happens unless you do it.",
    next: "Get your first repeatable processes out of your head and onto paper so someone else can run them.",
  },
  hands_on_team: {
    key: "hands_on_team",
    num: 2,
    name: "Hands-On Team",
    band: "4–10 people",
    defines:
      "You've made your first hires, but you're still doing the work and managing it at the same time.",
    breaks:
      "You're the bottleneck and the firefighter; things slip through the cracks.",
    next: "Define clear roles and a simple weekly rhythm so the team owns outcomes, not just tasks.",
  },
  stretched_owner: {
    key: "stretched_owner",
    num: 3,
    name: "Stretched Owner",
    band: "11–20 people",
    defines: "Too big to run on memory, too small for real structure.",
    breaks:
      "You're stretched across everything, and quality and margin start to wobble.",
    next: "Put in your first real managers, an org chart, and written SOPs for the core work.",
  },
  building_machine: {
    key: "building_machine",
    num: 4,
    name: "Building the Machine",
    band: "21–40 people",
    defines:
      "The do-it-all-yourself model is breaking; you need systems and a management layer.",
    breaks:
      "Decisions pile up on you, and good people leave when there's no clear structure.",
    next: "Build the leadership layer, real financial visibility, and accountable ownership of each function.",
  },
  professionalizing: {
    key: "professionalizing",
    num: 5,
    name: "Professionalizing",
    band: "41–75 people",
    defines:
      "Heroics give way to repeatable systems, real numbers, and managed teams.",
    breaks:
      "Without discipline, complexity outpaces your processes and margin erodes.",
    next: "Tighten financial controls, formalize hiring and onboarding, and measure what actually matters.",
  },
  scaling_engine: {
    key: "scaling_engine",
    num: 6,
    name: "Scaling Engine",
    band: "76–150 people",
    defines:
      "A leadership team runs the day-to-day; you finally work on the business, not in it.",
    breaks:
      "Misalignment between teams and unclear data quietly slow everything down.",
    next: "Drive strategy with data, deepen the leadership bench, and protect culture as you scale.",
  },
  self_sustaining: {
    key: "self_sustaining",
    num: 7,
    name: "Self-Sustaining Enterprise",
    band: "150+ people",
    defines:
      "Durable systems and a deep leadership bench run the company without you in every decision.",
    breaks:
      "The risk shifts to complacency, succession gaps, and staying relevant.",
    next: "Build succession, govern by metrics, and reinvest in the next stage of growth.",
  },
};

/** Resolve a stage from the chosen team-size band. */
export function stageForTeamSize(band: string): StageKey {
  return (
    TEAM_SIZE_BANDS.find((b) => b.value === band)?.stage ?? "founder_operator"
  );
}

export const REVENUE_BANDS = [
  "Under $250K",
  "$250K – $1M",
  "$1M – $3M",
  "$3M – $10M",
  "$10M – $25M",
  "$25M+",
] as const;
