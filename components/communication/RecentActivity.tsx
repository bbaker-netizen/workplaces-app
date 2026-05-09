/**
 * RecentActivity — latest N messages across every thread in the
 * engagement, audience-filtered to the viewer.
 *
 * Each row links to the parent thread so the reader can jump in.
 */

import Link from "next/link";
import { listEngagementRecentActivity } from "@/lib/db/queries/messages";
import { TOMBSTONE_BODY } from "@/lib/communication/tombstone";
import {
  THREAD_TYPE,
  threadTypeLabel,
} from "@/lib/communication/audience";
import { formatMessageTimestamp } from "./utils";

function excerptOf(body: string, max = 140): string {
  if (body === TOMBSTONE_BODY) return "[Message deleted]";
  // Strip markdown noise for the feed preview — keep it readable.
  const stripped = body
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_+([^_]+)_+/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > max ? `${stripped.slice(0, max - 1)}…` : stripped;
}

function hrefFor(
  parentEntityType: string,
  parentEntityId: string,
  scope: "portal" | "coach",
  engagementId: string,
): string {
  if (parentEntityType === THREAD_TYPE.actionItem) {
    return scope === "portal"
      ? `/portal/action-items/${parentEntityId}`
      : `/coach/action-items/${parentEntityId}`;
  }
  // Both engagement-level threads land on the Communication page —
  // the page itself decides which tab to open via a query param.
  const tab =
    parentEntityType === THREAD_TYPE.engagementLeadership
      ? "leadership"
      : "team";
  return scope === "portal"
    ? `/portal/communication?tab=${tab}`
    : `/coach/communication/${engagementId}?tab=${tab}`;
}

export async function RecentActivity({
  engagementId,
  scope,
  limit,
}: {
  engagementId: string;
  scope: "portal" | "coach";
  limit?: number;
}) {
  const rows = await listEngagementRecentActivity(engagementId, limit ?? 20);

  if (rows.length === 0) {
    return (
      <p className="font-sans text-sm text-muted-foreground italic">
        Nothing here yet. Once messages start flowing, the latest will
        show up here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[#CCCCCC] border-t border-b border-[#CCCCCC]">
      {rows.map(({ message, parentEntityType, parentEntityId, parentTitle }) => (
        <li key={message.id} className="py-3">
          <Link
            href={hrefFor(
              parentEntityType,
              parentEntityId,
              scope,
              engagementId,
            )}
            className="block group"
          >
            <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {threadTypeLabel(parentEntityType)}
              </span>
              <span className="font-sans text-sm font-bold text-foreground group-hover:underline underline-offset-4">
                {parentTitle}
              </span>
              <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                {formatMessageTimestamp(message.createdAt)}
              </span>
            </div>
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              <span className="text-foreground font-bold">
                {message.authorName}:
              </span>{" "}
              {excerptOf(message.body)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
