"use client";

/**
 * MessageComposer — client component, posts a new message via the
 * createMessage server action.
 *
 * Phase 1.3.5 upgrade: WYSIWYG editor (Tiptap) replaces the plain
 * textarea, plus an emoji picker. Output is markdown so the existing
 * `MarkdownBody` renderer keeps working unchanged.
 *
 * Submit on Cmd/Ctrl+Enter mirrors what most messaging apps do — handled
 * inside RichTextEditor's editorProps so plain Enter just inserts a new
 * paragraph.
 */

import { useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createMessage } from "@/lib/actions/messages";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "./RichTextEditor";
import { EmojiPickerButton } from "./EmojiPickerButton";
import {
  ComposerAttachmentPicker,
  type PendingAttachment,
} from "./ComposerAttachmentPicker";
import type { MentionMember } from "./MentionList";

export function MessageComposer({
  engagementId,
  parentEntityType,
  parentEntityId,
  placeholder,
  members,
}: {
  engagementId: string;
  parentEntityType: string;
  parentEntityId: string;
  placeholder?: string;
  /** Members the @-typeahead can offer as candidates. */
  members?: MentionMember[];
}) {
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!editorRef.current) return;
    const body = editorRef.current.getMarkdown();
    if (!body) return;
    // Block submit while an attachment upload is still in flight.
    if (attachments.some((a) => a.uploading)) {
      setError("Wait for attachments to finish uploading.");
      return;
    }
    const mentions = editorRef.current.getMentionIds();
    const attachmentIds = attachments
      .filter((a) => !a.uploading && !a.id.startsWith("pending-"))
      .map((a) => a.id);
    setError(null);
    startTransition(async () => {
      const result = await createMessage({
        engagementId,
        parentEntityType,
        parentEntityId,
        body,
        mentions,
        attachments: attachmentIds,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        editorRef.current?.clear();
        setIsEmpty(true);
        setAttachments([]);
      }
    });
  };


  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={
        "space-y-2 transition-opacity " + (isPending ? "opacity-60" : "")
      }
      aria-busy={isPending}
    >
      <div className="relative">
        <RichTextEditor
          editorRef={editorRef}
          placeholder={placeholder ?? "Write a message…"}
          disabled={isPending}
          onSubmit={submit}
          onChange={(md) => setIsEmpty(md.trim().length === 0)}
          ariaLabel="Write a message"
          members={members}
        />
        {isPending && (
          <span
            aria-hidden
            className="absolute right-3 top-12 text-[#2E4057]"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
          </span>
        )}
      </div>
      <ComposerAttachmentPicker
        engagementId={engagementId}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        disabled={isPending}
      />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <EmojiPickerButton
            ariaLabel="Insert emoji"
            onSelect={(emoji) => editorRef.current?.insertText(emoji)}
            anchor="top"
            align="left"
          />
          <span
            className={
              "font-mono text-[11px] uppercase tracking-[0.15em] " +
              (isPending
                ? "text-[#2E4057] font-bold"
                : "text-muted-foreground")
            }
          >
            {isPending
              ? "Posting your message…"
              : "⌘/Ctrl + Enter to send"}
          </span>
        </div>
        <button
          type="submit"
          disabled={isPending || isEmpty}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50 disabled:cursor-wait transition-colors"
        >
          {isPending && (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          )}
          {isPending ? "Posting…" : "Post"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
        >
          {error}
        </p>
      )}
    </form>
  );
}
