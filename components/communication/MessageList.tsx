/**
 * MessageList — render all messages in a thread, oldest first.
 */

import { MessageRow } from "./MessageRow";
import type { ListedMessage } from "@/lib/db/queries/messages";

export function MessageList({
  messages,
  viewerUserProfileId,
  viewerCanModerate,
  emptyState,
}: {
  messages: ListedMessage[];
  viewerUserProfileId: string;
  viewerCanModerate: boolean;
  emptyState?: React.ReactNode;
}) {
  if (messages.length === 0) {
    return (
      <div className="font-sans text-sm text-muted-foreground italic py-4">
        {emptyState ?? "No messages yet. Start the conversation."}
      </div>
    );
  }

  return (
    <ul className="space-y-4 sm:space-y-5">
      {messages.map((m) => (
        <MessageRow
          key={m.id}
          message={m}
          viewerUserProfileId={viewerUserProfileId}
          viewerCanModerate={viewerCanModerate}
        />
      ))}
    </ul>
  );
}
