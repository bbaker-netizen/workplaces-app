/**
 * MessageList — render all messages in a thread, oldest first.
 */

import { MessageRow } from "./MessageRow";
import type { ListedMessage } from "@/lib/db/queries/messages";
import type { ReactionsByEmoji } from "@/lib/db/queries/message-reactions";
import type { AttachedDocument } from "@/lib/db/queries/documents";
import type { MentionMember } from "./MentionList";

export function MessageList({
  messages,
  reactionsByMessageId,
  attachmentsByMessageId,
  viewerUserProfileId,
  viewerCanModerate,
  members,
  emptyState,
}: {
  messages: ListedMessage[];
  reactionsByMessageId?: Map<string, ReactionsByEmoji>;
  attachmentsByMessageId?: Map<string, AttachedDocument[]>;
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
          attachments={attachmentsByMessageId?.get(m.id) ?? []}
          viewerUserProfileId={viewerUserProfileId}
          viewerCanModerate={viewerCanModerate}
          members={members}
        />
      ))}
    </ul>
  );
}
