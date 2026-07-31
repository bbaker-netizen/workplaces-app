/**
 * Group a client's Fireflies recordings by the day they happened.
 *
 * **The problem.** Fireflies records whatever is on the calendar, and a
 * busy on-site morning produces one recording per conversation — A&M
 * Abatement has thirteen from a single day ("Craig conversation", "amir
 * conversation", "estimating meeting", "Kristina back half of
 * interview"). Listed flat, that reads as thirteen meetings and buries
 * every other client's actual sessions underneath it.
 *
 * **Why grouping rather than hiding.** The obvious alternative was to
 * show only recordings matched to a scheduled session. That would be a
 * much shorter list and it would be wrong: right now it would show 1 of
 * A&M's 29, and every ad-hoc call — which is most of the real coaching
 * conversation — would vanish from the client's record. A fragment is
 * often the only surviving account of a decision. So nothing is hidden;
 * a day is presented as a day.
 *
 * Days are computed in America/Edmonton, the same zone every other
 * visible timestamp in this app uses, so a 6pm meeting doesn't land on
 * tomorrow's heading because the row is stored in UTC.
 */

import { DateTime } from "luxon";

const ZONE = "America/Edmonton";

export type GroupableMeeting = {
  id: string;
  title: string;
  occurredAt: Date;
};

export type MeetingDayGroup<T extends GroupableMeeting> = {
  /** `yyyy-MM-dd` in Mountain Time — the group key. */
  dayKey: string;
  /** "Wednesday, 29 July 2026" */
  dayLabel: string;
  meetings: T[];
};

export function groupMeetingsByDay<T extends GroupableMeeting>(
  meetings: T[],
): MeetingDayGroup<T>[] {
  const byDay = new Map<string, T[]>();

  for (const m of meetings) {
    const dt = DateTime.fromJSDate(m.occurredAt, { zone: ZONE });
    const key = dt.toFormat("yyyy-MM-dd");
    const bucket = byDay.get(key);
    if (bucket) bucket.push(m);
    else byDay.set(key, [m]);
  }

  const groups = Array.from(byDay.entries()).map(([dayKey, items]) => {
    // Newest first inside the day, matching the page's overall order.
    items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    return {
      dayKey,
      dayLabel: DateTime.fromFormat(dayKey, "yyyy-MM-dd", {
        zone: ZONE,
      }).toFormat("cccc, d LLLL yyyy"),
      meetings: items,
    };
  });

  groups.sort((a, b) => (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0));
  return groups;
}

/**
 * A one-line preview of what a multi-recording day contained, so the
 * collapsed group still says what is inside it. Truncated rather than
 * listing thirteen titles across four lines — the point is to make the
 * day scannable.
 */
export function dayPreview(titles: string[], max = 3): string {
  const shown = titles.slice(0, max).join(" · ");
  const rest = titles.length - Math.min(max, titles.length);
  return rest > 0 ? `${shown} · +${rest} more` : shown;
}
