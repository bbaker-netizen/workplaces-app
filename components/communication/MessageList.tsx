/**
 * MessageList — render all messages in a thread, oldest first.
 */

import { MessageRow } from "./MessageRow";
import type { ListedMessage } from "@/lib/db/queries/messages";
import type { ReactionsByEmoji } from "@/lib/db/queries/message-reactions";
import type { MentionMember } from "./MentionList";

export function MessageList({
  messages,
  reactionsByMessageId,
  viewerUserProfileId,
  viewerCanModerate,
  members,
  emptyState,
}: {
  messages: ListedMessage[];
  reactionsByMessageId?: Map<string, ReactionsByEmoji>;
  viewerUserProfileId: string;
  viewerCanModerate: boolean;
  members?: MentionMember[];
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
          reactions={reactionsByMessageId?.get(m.id) ?? []}
          viewerUserProfileId={viewerUserProfileId}
          viewerCanModerate={viewerCanModerate}
          members={members}
        />
      ))}
    </ul>
  );
}
