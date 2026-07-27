/**
 * Public-assessment capture — parsing, normalizing and labelling the result
 * a lead produced before we ever spoke to them.
 *
 * Today the only producer is Base Camp (/base-camp/), which asks ten
 * questions, scores each of the four Business Building Blocks 0 to 6 (higher
 * is worse) and names the weakest block as the reader's starting camp. It
 * POSTs to the Make quiz webhook, which forwards an `assessment` object to
 * /api/leads/<token>.
 *
 * Everything arriving here is untrusted and, because Make renders its JSON
 * from a string template, every value arrives as a string. This module is the
 * one place that turns that into a shape the app can rely on:
 *
 *   - scores coerced to numbers, clamped to the 0 to 6 the tool can emit,
 *     and dropped rather than guessed when they are not numeric
 *   - keys accepted in snake_case (what Make sends) or camelCase
 *   - free text truncated so a hostile payload cannot write an enormous row
 *   - a null return whenever the payload carries nothing worth storing, so
 *     callers can simply skip the write
 *
 * The band thresholds below MUST stay in step with the Base Camp page. The
 * reader is told their People block is "Cracked"; Bruce opening the same lead
 * has to see the same word, or the first conversation starts with a
 * contradiction.
 */

/** The four Business Building Blocks, in the order Base Camp displays them. */
export const ASSESSMENT_BLOCKS = ["money", "time", "systems", "people"] as const;
export type AssessmentBlock = (typeof ASSESSMENT_BLOCKS)[number];

/** Highest score any single block can carry (two questions, 0 to 3 each). */
export const MAX_BLOCK_SCORE = 6;

export type AssessmentBand = "solid" | "watch" | "cracked";

export type StoredAssessment = {
  /** Which tool produced this, e.g. "base_camp". Lets a later assessment
   *  share the column without the panel guessing what it is looking at. */
  tool: string;
  /** What they said brought them here, in their own words. */
  goal: string | null;
  /** Normalized intent: grow | rescue | mixed. */
  goalCode: "grow" | "rescue" | "mixed" | null;
  teamSize: string | null;
  revenueBand: string | null;
  weakestBlock: AssessmentBlock | null;
  weakestScore: number | null;
  secondBlock: AssessmentBlock | null;
  blocks: Partial<Record<AssessmentBlock, number>>;
  /** Question key to the answer they picked, verbatim. */
  answers: Record<string, string>;
};

const MAX_TEXT = 300;
const MAX_ANSWERS = 40;

function str(v: unknown, max = MAX_TEXT): string | null {
  if (v === null || v === undefined || typeof v === "object") return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/** Make sends numbers as strings. Anything non-numeric, negative, or above
 *  what the tool can emit is treated as absent rather than coerced to 0 —
 *  a wrong score is worse than a missing one, because it reads as real. */
function score(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > MAX_BLOCK_SCORE) return null;
  return rounded;
}

function block(v: unknown): AssessmentBlock | null {
  const s = str(v, 40);
  if (!s) return null;
  const lower = s.toLowerCase();
  return (ASSESSMENT_BLOCKS as readonly string[]).includes(lower)
    ? (lower as AssessmentBlock)
    : null;
}

function goalCode(v: unknown): StoredAssessment["goalCode"] {
  const s = str(v, 20)?.toLowerCase();
  if (s === "grow" || s === "rescue" || s === "mixed") return s;
  return null;
}

/** Read a key in either the snake_case Make sends or camelCase. */
function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  return undefined;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Normalize an incoming `assessment` payload. Returns null when the payload
 * is missing, malformed, or carries no block score and no answer — there is
 * nothing to show on a panel, so the caller should not write the column.
 */
export function parseAssessment(raw: unknown): StoredAssessment | null {
  if (!isPlainObject(raw)) return null;

  const blocks: Partial<Record<AssessmentBlock, number>> = {};
  const blocksRaw = pick(raw, "blocks");
  if (isPlainObject(blocksRaw)) {
    for (const key of ASSESSMENT_BLOCKS) {
      const n = score(blocksRaw[key]);
      if (n !== null) blocks[key] = n;
    }
  }
  // Tolerate flat `money_score` style too, so a future producer that does not
  // nest under `blocks` still lands correctly instead of silently empty.
  for (const key of ASSESSMENT_BLOCKS) {
    if (blocks[key] !== undefined) continue;
    const n = score(pick(raw, `${key}_score`, `${key}Score`));
    if (n !== null) blocks[key] = n;
  }

  const answers: Record<string, string> = {};
  const answersRaw = pick(raw, "answers");
  if (isPlainObject(answersRaw)) {
    for (const [k, v] of Object.entries(answersRaw)) {
      if (Object.keys(answers).length >= MAX_ANSWERS) break;
      const key = str(k, 60);
      const val = str(v);
      if (key && val) answers[key] = val;
    }
  }

  const weakestBlock = block(pick(raw, "weakest_block", "weakestBlock"));
  const weakestScoreRaw = score(pick(raw, "weakest_score", "weakestScore"));
  // Trust the block scores over the reported headline: if the tool named a
  // weakest block, its score is whatever that block scored.
  const weakestScore =
    weakestBlock && blocks[weakestBlock] !== undefined
      ? blocks[weakestBlock]!
      : weakestScoreRaw;

  const parsed: StoredAssessment = {
    tool: str(pick(raw, "tool"), 40) ?? "assessment",
    goal: str(pick(raw, "goal")),
    goalCode: goalCode(pick(raw, "goal_code", "goalCode")),
    teamSize: str(pick(raw, "team_size", "teamSize"), 60),
    revenueBand: str(pick(raw, "revenue_band", "revenueBand"), 60),
    weakestBlock,
    weakestScore,
    secondBlock: block(pick(raw, "second_block", "secondBlock")),
    blocks,
    answers,
  };

  const hasSomething =
    Object.keys(parsed.blocks).length > 0 ||
    Object.keys(parsed.answers).length > 0;
  return hasSomething ? parsed : null;
}

/** Same thresholds, and the same words, the reader saw on the result screen. */
export function bandFor(scoreValue: number): AssessmentBand {
  if (scoreValue <= 1) return "solid";
  if (scoreValue <= 3) return "watch";
  return "cracked";
}

export function bandLabel(band: AssessmentBand): string {
  if (band === "solid") return "Solid";
  if (band === "watch") return "Watch it";
  return "Cracked";
}

export function blockLabel(b: AssessmentBlock): string {
  return b.charAt(0).toUpperCase() + b.slice(1);
}

/** "Grow" / "Rescue" / "Both" for the header chip. Null when they did not say. */
export function goalLabel(code: StoredAssessment["goalCode"]): string | null {
  if (code === "grow") return "Wants to grow";
  if (code === "rescue") return "Wants it rescued";
  if (code === "mixed") return "Somewhere in between";
  return null;
}

/** `evenings_per_week` becomes `Evenings per week` for the answers list. */
export function humanizeAnswerKey(key: string): string {
  const words = key.replace(/[_\-.]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * One-line summary for a list row or an email subject, e.g.
 * "Base camp: People (Cracked), wants it rescued".
 */
export function assessmentSummary(a: StoredAssessment): string {
  const parts: string[] = [];
  if (a.weakestBlock) {
    const label = blockLabel(a.weakestBlock);
    const s = a.weakestScore;
    parts.push(
      s === null ? `Base camp: ${label}` : `Base camp: ${label} (${bandLabel(bandFor(s))})`,
    );
  }
  const goal = goalLabel(a.goalCode);
  if (goal) parts.push(goal.toLowerCase());
  return parts.join(", ");
}
