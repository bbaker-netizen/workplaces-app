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
      <div className="p-4 sm:p-5">
        {/* Top row: status pill + revenue/margin badges */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <StatusPill
            itemId={item.id}
            status={item.status}
            options={statusOptions}
            disabled={pillDisabled}
          />
          <div className="flex gap-1.5 flex-wrap justify-end">
            {item.revenueImpact && (
              <span className="font-mono text-[9px] uppercase tracking-tbb-caps px-2 py-0.5 rounded-sm border border-tbb-navy text-tbb-navy">
                Revenue
              </span>
            )}
            {item.marginImpact && (
              <span className="font-mono text-[9px] uppercase tracking-tbb-caps px-2 py-0.5 rounded-sm border border-tbb-navy text-tbb-navy">
                Margin
              </span>
            )}
          </div>
        </div>

        {/* Title — clickable to detail */}
        <Link
          href={detailHref}
          className="block font-bold text-foreground tracking-tight text-xl sm:text-2xl leading-tight hover:underline underline-offset-4 decoration-2"
        >
          {item.title}
        </Link>

        {/* Optional description excerpt — rendered through the shared
            markdown renderer (Phase 1.3) so Coach-authored descriptions
            with **bold**, lists, links, etc., display correctly. The
            line-clamp keeps cards compact in the list view. */}
        {item.description && (
          <div className="mt-2 line-clamp-2 text-muted-foreground">
            <MarkdownBody body={item.description} />
          </div>
        )}

        {/* Bottom row: assignee + due + (optional) engagement label */}
        <div className="mt-4 flex items-center flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground">
          <span>
            <span className="uppercase tracking-tbb-caps mr-1.5">Owner</span>
            <span className={item.assigneeName ? "text-foreground" : ""}>
              {item.assigneeName ?? "Unassigned"}
            </span>
          </span>
          <span>
            <span className="uppercase tracking-tbb-caps mr-1.5">Due</span>
            <span
              className={
                overdue ? "text-tbb-danger font-bold" : "text-foreground"
              }
            >
              {formatDueDate(item.dueDate)}
            </span>
          </span>
          {item.engagementName && (
            <span>
              <span className="uppercase tracking-tbb-caps mr-1.5">Client</span>
              <span className="text-foreground">{item.engagementName}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
