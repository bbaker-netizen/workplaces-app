/**
 * The client-facing recap for a session: read it, change it, send it.
 *
 * Before this panel the only way to act on a drafted recap was the
 * approve link in the emailed copy, which sends it exactly as the model
 * wrote it. Nothing in the app displayed a recap at all, so "needs an
 * edit first?" pointed at a page that had no recap on it.
 *
 * Two rules shape the layout:
 *
 *   - **Nothing reaches a client unread.** The body is shown in full,
 *     not behind a disclosure, and the send button states the number of
 *     people it will actually email before it is pressed.
 *   - **Sent is final.** Once a recap has gone, the text is the record of
 *     what the client was told. It renders read-only from then on;
 *     correcting it afterwards would rewrite history rather than fix it.
 */

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, Pencil, Send, X } from "lucide-react";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { sendRecapNow, updateRecapDraft } from "@/lib/actions/session-recaps";
import type { WorkspaceRecap } from "@/lib/db/queries/meeting-workspace";

const TZ = "America/Edmonton";

function stamp(d: Date | string): string {
  return new Date(d).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function RecapPanel({
  recap,
  engagementId,
  clientLabel,
}: {
  recap: WorkspaceRecap;
  engagementId: string;
  clientLabel: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(recap.subject);
  const [body, setBody] = useState(recap.bodyMarkdown);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDraft = recap.status === "draft";
  const isSent = recap.status === "sent";

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateRecapDraft({
        recapId: recap.id,
        engagementId,
        subject: subject.trim(),
        bodyMarkdown: body.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      setNotice("Saved. Nothing has been sent.");
      router.refresh();
    });
  };

  const onCancel = () => {
    setSubject(recap.subject);
    setBody(recap.bodyMarkdown);
    setEditing(false);
    setError(null);
  };

  const onSend = () => {
    // The confirm names the client and the headcount, because the two
    // things worth being sure about are "the right client" and "this
    // actually goes to a person".
    const question =
      recap.recipientCount > 0
        ? `Send this recap to ${recap.recipientCount} contact${recap.recipientCount === 1 ? "" : "s"} at ${clientLabel}?`
        : `Nobody at ${clientLabel} has a portal account, so this will be filed on their portal thread but emailed to no one. File it anyway?`;
    if (!window.confirm(question)) return;

    setError(null);
    startTransition(async () => {
      const result = await sendRecapNow({ recapId: recap.id, engagementId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        result.sentTo > 0
          ? `Sent to ${result.sentTo} contact${result.sentTo === 1 ? "" : "s"} at ${result.clientLabel}.`
          : `Filed on ${result.clientLabel}'s portal thread. Nobody was emailed — no one there has a portal account yet.`,
      );
      router.refresh();
    });
  };

  return (
    <section className="rounded-md border border-tbb-line bg-white px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Recap for {clientLabel}
          </p>
          <StatusLine recap={recap} />
        </div>

        {isDraft && !editing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-navy hover:text-tbb-blue disabled:opacity-50"
            >
              <Pencil className="w-3 h-3" aria-hidden /> Edit
            </button>
            <button
              type="button"
              onClick={onSend}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-pill bg-tbb-navy px-3 py-1.5 text-xs font-bold uppercase tracking-tbb-caps text-white hover:bg-tbb-blue disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
              ) : (
                <Send className="w-3 h-3" aria-hidden />
              )}
              {recap.recipientCount > 0 ? "Send to client" : "File it"}
            </button>
          </div>
        )}
      </div>

      {/* The headcount is stated before the tap, not after. Zero is both
          common and silent: a client nobody has invited to their portal
          has no contacts to email, and discovering that afterwards is how
          a coach believes a client was written to when they were not. */}
      {isDraft && (
        <p className="text-[11px] text-tbb-ink-3 inline-flex items-center gap-1">
          <Mail className="w-3 h-3" aria-hidden />
          {recap.recipientCount > 0
            ? `Sending emails ${recap.recipientCount} contact${recap.recipientCount === 1 ? "" : "s"} at ${clientLabel} and files a permanent copy on their portal thread.`
            : `No one at ${clientLabel} has a portal account, so this would be filed on their portal thread but emailed to nobody.`}
        </p>
      )}

      {error && (
        <p className="text-xs text-tbb-orange font-bold" role="alert">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="text-xs text-tbb-blue font-bold" role="status">
          {notice}
        </p>
      )}

      {editing ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Subject
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-tbb-line px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Body — Markdown
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={20}
              className="w-full rounded-md border border-tbb-line px-3 py-2 font-mono text-[13px] leading-relaxed"
            />
          </label>
          <p className="text-[11px] text-tbb-ink-3">
            The emailed copy and the copy filed on the client&rsquo;s portal are
            both built from this, so they cannot end up saying different things.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={isPending || !body.trim() || !subject.trim()}
              className="inline-flex items-center gap-1.5 rounded-pill bg-tbb-navy px-3 py-1.5 text-xs font-bold uppercase tracking-tbb-caps text-white hover:bg-tbb-blue disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
              ) : (
                <Check className="w-3 h-3" aria-hidden />
              )}
              Save draft
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy disabled:opacity-50"
            >
              <X className="w-3 h-3" aria-hidden /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-bold text-tbb-ink">{recap.subject}</p>
          <div className="rounded-md bg-tbb-cream-50 px-3 py-2">
            <MarkdownBody body={recap.bodyMarkdown} />
          </div>
          {isSent && (
            <p className="text-[11px] text-tbb-ink-3">
              Already sent, so this is the record of what the client was told
              and is no longer editable.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function StatusLine({ recap }: { recap: WorkspaceRecap }) {
  if (recap.status === "sent" && recap.sentAt) {
    return (
      <p className="text-xs text-tbb-blue font-bold">
        Sent {stamp(recap.sentAt)}
      </p>
    );
  }
  if (recap.status === "approved") {
    // Approved but not sent is a real state, not a display quirk:
    // `sent_at` is stamped only after delivery succeeds, so a send that
    // failed leaves the recap here rather than falsely marked done.
    return (
      <p className="text-xs text-tbb-orange font-bold">
        Approved{recap.approvedAt ? ` ${stamp(recap.approvedAt)}` : ""}, but
        delivery did not complete.
      </p>
    );
  }
  return (
    <p className="text-xs text-tbb-ink-3">
      Draft — nothing has been sent to the client.
    </p>
  );
}
