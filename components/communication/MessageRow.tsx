/**
 * MessageRow — single message in a thread.
 *
 * Server component for the static layout (avatar/initials, author name,
 * timestamp, body). The edit/delete affordances are encapsulated in the
 * MessageActions client component which mounts only when the viewer is
 * the author or a leadership role.
 *
 * Tombstoned messages render as a single muted "[Message deleted]" line
 * — the row stays in place so the conversation still flows past it
 * (WhatsApp-style; per Bruce 2026-05-09).
 */

import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { isTombstone as messageIsTombstone } from "@/lib/communication/tombstone";
import { formatMessageTimestamp } from "./utils";
import { MessageActions } from "./MessageActions";
import type { ListedMessage } from "@/lib/db/queries/messages";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function MessageRow({
  message,
  viewerUserProfileId,
  viewerCanModerate,
}: {
  message: ListedMessage;
  viewerUserProfileId: string;
  viewerCanModerate: boolean;
}) {
  const isTombstone = messageIsTombstone(message);
  const isAuthor = message.authorUserProfileId === viewerUserProfileId;
  const showActions = !isTombstone && (isAuthor || viewerCanModerate);

  return (
    <li className="flex gap-3 sm:gap-4 group">
      <div
        aria-hidden
        className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-[#CCCCCC] bg-[#F5F1E8] grid place-items-center font-mono text-xs uppercase tracking-wider text-[#666666]"
      >
        {initialsOf(message.authorName) || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <header className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
          <span className="font-sans text-sm font-bold text-foreground">
            {message.authorName}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            {formatMessageTimestamp(message.createdAt)}
          </span>
          {message.editedAt && !isTombstone && (
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground italic">
              · edited
            </span>
          )}
          {showActions && (
            <span className="ml-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <MessageActions
                messageId={message.id}
                initialBody={message.body}
                isAuthor={isAuthor}
              />
            </span>
          )}
        </header>
        <div className="mt-1">
          {isTombstone ? (
            <p className="font-sans text-sm italic text-muted-foreground">
              [Message deleted]
            </p>
          ) : (
            <MarkdownBody body={message.body} />
          )}
        </div>
      </div>
    </li>
  );
}
