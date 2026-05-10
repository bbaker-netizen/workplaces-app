/**
 * MessageThread — server-rendered thread shell for one parent entity.
 *
 * Fetches the messages for `(threadType, parentEntityId)`, renders the
 * list, then renders the composer. Audience checks happen one layer
 * down in `listMessagesForEntity` and `createMessage`; this component
 * trusts the caller passed a thread type the viewer can see.
 *
 * Used by:
 *   - The action item detail page (threadType="action_item")
 *   - The portal Communication page's Leadership / Team tabs
 *   - The coach Communication page's Leadership / Team tabs
 */

import {
  listMessagesForEntity,
  type ListedMessage,
} from "@/lib/db/queries/messages";
import { listReactionsForMessages } from "@/lib/db/queries/message-reactions";
import { listAttachmentsForMessages } from "@/lib/db/queries/documents";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { THREAD_TYPE, type ThreadType } from "@/lib/communication/audience";
import type { UserProfile } from "@/lib/db/schema";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { ThreadSummaryButton } from "./ThreadSummaryButton";

type Role = UserProfile["role"];

const MODERATOR_ROLES: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];

function isModerator(role: Role): boolean {
  return (MODERATOR_ROLES as readonly string[]).includes(role);
}

export async function MessageThread({
  engagementId,
  threadType,
  parentEntityId,
  composerPlaceholder,
  emptyState,
  preloadedMessages,
}: {
  engagementId: string;
  threadType: ThreadType;
  parentEntityId: string;
  composerPlaceholder?: string;
  emptyState?: React.ReactNode;
  /** Optional — caller may have already loaded the messages. Avoids a
   * second round-trip when both the page and a child want to render
   * the same thread.
   */
  preloadedMessages?: ListedMessage[];
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;

  const messages =
    preloadedMessages ??
    (await listMessagesForEntity(threadType, parentEntityId));
  const [reactionsByMessageId, attachmentsByMessageId, members] =
    await Promise.all([
      listReactionsForMessages(messages.map((m) => m.id), engagementId),
      listAttachmentsForMessages(messages.map((m) => m.id), engagementId),
      listEngagementMembers(engagementId),
    ]);
  const mentionMembers = members.map((m) => ({
    id: m.id,
    label: m.fullName,
    email: m.email,
  }));

  return (
    <section className="space-y-6">
      {messages.length >= 3 && (
        <ThreadSummaryButton
          threadType={threadType}
          parentEntityId={parentEntityId}
        />
      )}
      <MessageList
        messages={messages}
        reactionsByMessageId={reactionsByMessageId}
        attachmentsByMessageId={attachmentsByMessageId}
        viewerUserProfileId={profile.userProfileId}
        viewerCanModerate={isModerator(profile.role)}
        members={mentionMembers}
        emptyState={emptyState}
      />
      <div className="border-t border-[#CCCCCC] pt-4">
        <MessageComposer
          engagementId={engagementId}
          parentEntityType={threadType}
          parentEntityId={parentEntityId}
          placeholder={composerPlaceholder}
          members={mentionMembers}
        />
      </div>
    </section>
  );
}

export { THREAD_TYPE };
