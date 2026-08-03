/**
 * ActionItemCard — server-rendered card display.
 *
 * Used by both portal and Coach views. The optional `engagementName`
 * surfaces the engagement label only on Coach-view cards (where items
 * span engagements).
 */

import Link from "next/link";
import {
  formatDueDate,
  isOverdueFromAny,
  type ActionItemStatus,
} from "./utils";
import { StatusPill } from "./StatusPill";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

export type ActionItemCardData = {
  id: string;
  title: string;
  description: string | null;
  status: ActionItemStatus;
  assigneeName: string | null;
  dueDate: Date | string | null;
  revenueImpact: boolean;
  marginImpact: boolean;
  engagementName?: string | null;
};

export function ActionItemCard({
  item,
  detailHref,
  statusOptions,
  pillDisabled,
}: {
  item: ActionItemCardData;
  detailHref: string;
  statusOptions: readonly ActionItemStatus[];
  pillDisabled?: boolean;
}) {
  const overdue = isOverdueFromAny(item.dueDate, item.status);

  return (
    <article
      className={
        "group relative bg-white border rounded-md transition-colors " +
        (overdue
          ? "border-tbb-danger shadow-[inset_4px_0_0_0_#E87722]"
          : "border-tbb-line hover:border-tbb-ink-3")
      }
    >
      {/* Three tight rows, not six tall ones. A list is for scanning:
          the old card set the title at text-2xl with its own padded
          block and gave the status pill a whole row to itself, so three
          items filled a screen and you could never see a client's work
          at once. Title is body-scale here and the pill shares its
          line. */}
      <div className="px-3.5 py-2.5">
        {/* Row 1: pill + title + quality-gate badges, all on one line. */}
        <div className="flex items-baseline gap-2.5">
          <span className="shrink-0 self-center">
            <StatusPill
              itemId={item.id}
              status={item.status}
              options={statusOptions}
              disabled={pillDisabled}
            />
          </span>
          <Link
            href={detailHref}
            className="flex-1 min-w-0 font-bold text-[15px] text-foreground leading-snug hover:underline underline-offset-2"
          >
            {item.title}
          </Link>
          {(item.revenueImpact || item.marginImpact) && (
            <span className="shrink-0 flex gap-1 self-center">
              {item.revenueImpact && (
                <span className="font-mono text-[9px] uppercase tracking-tbb-caps px-1.5 py-0.5 rounded-sm border border-tbb-navy text-tbb-navy">
                  Rev
                </span>
              )}
              {item.marginImpact && (
                <span className="font-mono text-[9px] uppercase tracking-tbb-caps px-1.5 py-0.5 rounded-sm border border-tbb-navy text-tbb-navy">
                  Mgn
                </span>
              )}
            </span>
          )}
        </div>

        {/* Row 2: description, one line. Clamped to 1 rather than 2 —
            it is a hint at what the item is about, and the detail page
            is one click away for the rest. */}
        {item.description && (
          <div className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground [&_p]:inline">
            <MarkdownBody body={item.description} />
          </div>
        )}

        {/* Row 3: owner · due · client, separated by dots rather than
            wide gaps so the whole line reads as one string. */}
        <div className="mt-1 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-mono text-muted-foreground">
          <span className={item.assigneeName ? "text-foreground" : ""}>
            {item.assigneeName ?? "Unassigned"}
          </span>
          <span aria-hidden className="text-tbb-line">·</span>
          <span
            className={overdue ? "text-tbb-danger font-bold" : "text-foreground"}
          >
            {formatDueDate(item.dueDate)}
          </span>
          {item.engagementName && (
            <>
              <span aria-hidden className="text-tbb-line">·</span>
              <span className="text-foreground">{item.engagementName}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
