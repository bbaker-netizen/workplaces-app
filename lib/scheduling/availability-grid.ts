/**
 * The client-facing availability GRID — shape and labels, shared by the
 * public form, the server that validates a submission, and the console panel
 * that displays the answer.
 *
 * Distinct from `availability.ts`, which computes a Business Builder's own
 * free/busy from their calendar. This is the opposite direction: asking the
 * CLIENT which windows suit them for a recurring session.
 *
 * One definition so the three surfaces can't disagree about what "Morning"
 * means. The hours are stated on the form deliberately — a client answering
 * "mornings" without being told the range is guessing, and a guess costs a
 * rescheduled two-hour session.
 */

export const GRID_DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
] as const;

export const GRID_PERIODS = [
  { key: "morning", label: "Morning", hours: "8:00 AM – 12:00 PM" },
  { key: "afternoon", label: "Afternoon", hours: "1:00 PM – 5:00 PM" },
] as const;

/** Stated on the form so a client in another province isn't quietly
 *  answering a different question. */
export const GRID_TIMEZONE_LABEL = "Mountain Time (Edmonton)";

export type GridDay = (typeof GRID_DAYS)[number]["key"];
export type GridPeriod = (typeof GRID_PERIODS)[number]["key"];

export type GridSlot = { day: GridDay; period: GridPeriod };

const DAY_KEYS = new Set<string>(GRID_DAYS.map((d) => d.key));
const PERIOD_KEYS = new Set<string>(GRID_PERIODS.map((p) => p.key));

/** Keep only well-formed, non-duplicate slots. The submission endpoint is
 *  public, so nothing in the request is trusted. */
export function sanitizeSlots(input: unknown): GridSlot[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: GridSlot[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const day = (raw as { day?: unknown }).day;
    const period = (raw as { period?: unknown }).period;
    if (typeof day !== "string" || typeof period !== "string") continue;
    if (!DAY_KEYS.has(day) || !PERIOD_KEYS.has(period)) continue;
    const key = `${day}:${period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ day: day as GridDay, period: period as GridPeriod });
  }
  return out;
}

/** "Monday morning, Wednesday afternoon" — for emails and the console. */
export function describeSlots(slots: GridSlot[]): string {
  if (slots.length === 0) return "No windows selected";
  return slots
    .map((s) => {
      const day = GRID_DAYS.find((d) => d.key === s.day)?.label ?? s.day;
      const period =
        GRID_PERIODS.find((p) => p.key === s.period)?.label ?? s.period;
      return `${day} ${period.toLowerCase()}`;
    })
    .join(", ");
}
