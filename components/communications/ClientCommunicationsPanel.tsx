"use client";

/**
 * ClientCommunicationsPanel — per-client unified inbox.
 *
 * Renders every external communication (email / SMS / WhatsApp / call
 * note) attached to a single prospect OR engagement, with channel
 * filters, an inline composer that supports email today and SMS /
 * WhatsApp once Twilio is configured, and a reply action on each
 * inbound message.
 *
 * Data is provided server-side (already filtered to this prospect or
 * engagement); the component only handles UI state.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Mail,
  Paperclip,
  Phone,
  Smartphone,
  StickyNote,
  X,
} from "lucide-react";
import { sendClientMessage } from "@/lib/actions/send-client-message";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/communication/RichTextEditor";
import { resolveTemplateForProspect } from "@/lib/actions/email-templates";
import { syncContactEmails } from "@/lib/actions/gmail-backfill";
import type { CommunicationRow } from "@/lib/db/queries/client-communications";

export type EmailTemplateOption = {
  id: string;
  name: string;
  category: string;
};

type Channel = "all" | "email" | "sms" | "phone_call" | "meeting_note";

export function ClientCommunicationsPanel({
  prospectId,
  engagementId,
  contactName,
  contactEmail,
  contactPhone,
  rows,
  smsEnabled,
  readOnly = false,
  emailTemplates = [],
  embedded = false,
}: {
  prospectId?: string;
  engagementId?: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  rows: CommunicationRow[];
  /** Whether Twilio SMS is configured in env. */
  smsEnabled: boolean;
  /** When true, hide compose buttons + reply actions. Used on the
   *  client-portal side where the audit trail is visible but the
   *  client uses their own email / phone to reply. */
  readOnly?: boolean;
  /** Available email templates the user can pick from when composing.
   *  Only meaningful for prospect context — engagement-level template
   *  resolution lands in a later phase. */
  emailTemplates?: EmailTemplateOption[];
  /** When inside a CollapsibleSection, drop the outer card chrome + the
   *  "Communications" title (the drawer supplies them). The channel tabs
   *  and compose actions stay. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Channel>("all");
  type Attachment = {
    filename: string;
    contentType: string;
    base64: string;
    sizeBytes: number;
  };
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const [composing, setComposing] = useState<null | {
    channel: "email" | "sms";
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    replyTo?: CommunicationRow;
    attachments: Attachment[];
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentNotice, setSentNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  function onSyncEmails() {
    if (!contactEmail || syncing) return;
    setSyncMsg(null);
    setSyncing(true);
    void (async () => {
      const r = await syncContactEmails({ contactEmail });
      setSyncing(false);
      if (!r.ok) {
        setSyncMsg(r.error);
        return;
      }
      setSyncMsg(
        r.captured > 0
          ? `Pulled ${r.captured} email${r.captured === 1 ? "" : "s"} from Gmail.`
          : "No earlier emails found for this contact in the last year.",
      );
      if (r.captured > 0) router.refresh();
    })();
  }

  // Composer ref + auto-scroll. The composer renders at the TOP of
  // the timeline; if Bruce hits Reply on a row that's already scrolled
  // down the page, the composer opens out of sight. Scroll it into
  // view as soon as it mounts so the cursor lands where his eye does.
  //
  // Effect runs on every OPEN/CLOSE event, not on every keystroke —
  // we key off whether the composer is open + which row (if any) it's
  // replying to.
  const composerRef = useRef<HTMLDivElement | null>(null);
  const composerOpenKey = composing
    ? `${composing.channel}:${composing.replyTo?.id ?? "new"}`
    : "closed";
  useEffect(() => {
    if (composerOpenKey === "closed") return;
    // Defer to next frame so the composer DOM is in place before we
    // measure its position.
    const handle = window.requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      // Focus the body so the user can start typing immediately.
      const editable = composerRef.current?.querySelector<HTMLElement>(
        "textarea, [contenteditable='true']",
      );
      editable?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(handle);
  }, [composerOpenKey]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.channel === filter);
  }, [rows, filter]);

  function openEmailCompose(replyTo?: CommunicationRow) {
    setError(null);
    setComposing({
      channel: "email",
      to: replyTo?.fromAddress ?? contactEmail ?? "",
      cc: "",
      bcc: "",
      subject: replyTo?.subject
        ? replyTo.subject.startsWith("Re: ")
          ? replyTo.subject
          : `Re: ${replyTo.subject}`
        : "",
      body: "",
      replyTo,
      attachments: [],
    });
  }
  function openSmsCompose() {
    setError(null);
    setComposing({
      channel: "sms",
      to: contactPhone ?? "",
      subject: "",
      body: "",
      attachments: [],
    });
  }

  async function addAttachments(files: FileList | null) {
    if (!composing || !files || files.length === 0) return;
    const newOnes: Attachment[] = [];
    for (const file of Array.from(files)) {
      const base64 = await fileToBase64(file);
      newOnes.push({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        base64,
        sizeBytes: file.size,
      });
    }
    setComposing({
      ...composing,
      attachments: [...composing.attachments, ...newOnes],
    });
  }

  function removeAttachment(index: number) {
    if (!composing) return;
    const next = composing.attachments.slice();
    next.splice(index, 1);
    setComposing({ ...composing, attachments: next });
  }

  function submitCompose() {
    if (!composing) return;
    // Email body comes from the rich-text editor (markdown); SMS stays a
    // plain textarea.
    const composedBody =
      composing.channel === "email"
        ? (editorRef.current?.getMarkdown() ?? "")
        : composing.body;
    if (!composedBody.trim()) {
      setError("Write a message before sending.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await sendClientMessage({
        prospectId: prospectId ?? null,
        engagementId: engagementId ?? null,
        channel: composing.channel,
        to: [composing.to],
        cc:
          composing.channel === "email"
            ? (composing.cc ?? "")
                .split(/[,;]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        bcc:
          composing.channel === "email"
            ? (composing.bcc ?? "")
                .split(/[,;]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        subject: composing.channel === "email" ? composing.subject : null,
        body: composedBody,
        inReplyTo:
          composing.replyTo?.externalId && composing.channel === "email"
            ? composing.replyTo.externalId
            : null,
        references: composing.replyTo?.threadKey ?? null,
        attachments:
          composing.channel === "email" && composing.attachments.length > 0
            ? composing.attachments.map((a) => ({
                filename: a.filename,
                contentType: a.contentType,
                base64: a.base64,
              }))
            : undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Give Bruce visible feedback on success. The router.refresh()
      // will repopulate the timeline with the new row, but a flash
      // confirmation kills the "did anything happen?" question.
      // Also surfaces the Gmail self-send routing quirk so testing
      // by emailing yourself doesn't look like a silent failure.
      const channelLabel = composing.channel === "email" ? "Email" : "SMS";
      const toLine = composing.to;
      setSentNotice(
        composing.channel === "email"
          ? `${channelLabel} sent to ${toLine}. Check your Gmail Sent folder to confirm. Note: if you sent to yourself, Gmail doesn't double-deliver — the message lands in Sent only, not your Inbox.`
          : `${channelLabel} sent to ${toLine}.`,
      );
      setTimeout(() => setSentNotice(null), 12_000);
      setComposing(null);
      router.refresh();
    });
  }

  const Wrapper = embedded ? "div" : "section";
  return (
    <Wrapper
      className={
        embedded ? "" : "border border-tbb-line rounded-lg bg-white shadow-tbb-sm"
      }
    >
      {sentNotice && (
        <div
          role="status"
          className="border-b border-tbb-success/30 bg-tbb-success/10 px-5 py-3 text-sm text-tbb-ink-2 flex items-start gap-3"
        >
          <span aria-hidden className="text-tbb-success text-base">✓</span>
          <span className="leading-snug">{sentNotice}</span>
          <button
            type="button"
            onClick={() => setSentNotice(null)}
            className="ml-auto text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
          >
            Dismiss
          </button>
        </div>
      )}
      <header className="border-b border-tbb-line-soft px-5 py-3 flex items-center gap-3 flex-wrap">
        {!embedded && (
          <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Communications
          </h2>
        )}
        <span className="text-xs text-tbb-ink-3 tabular-nums">
          {filtered.length} of {rows.length}
        </span>
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          <ChannelTab active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </ChannelTab>
          <ChannelTab active={filter === "email"} onClick={() => setFilter("email")}>
            Email
          </ChannelTab>
          <ChannelTab active={filter === "sms"} onClick={() => setFilter("sms")}>
            SMS
          </ChannelTab>
          <ChannelTab
            active={filter === "phone_call"}
            onClick={() => setFilter("phone_call")}
          >
            Calls
          </ChannelTab>
        </div>
      </header>

      {!readOnly && (
        <div className="px-5 py-3 border-b border-tbb-line-soft flex flex-wrap gap-2">
          <ComposeButton
            icon={<Mail className="w-3.5 h-3.5" aria-hidden />}
            onClick={() => openEmailCompose()}
            label="Email"
            disabled={!contactEmail}
            tooltip={contactEmail ? undefined : "Add a contact email on the prospect first"}
          />
          <ComposeButton
            icon={<Smartphone className="w-3.5 h-3.5" aria-hidden />}
            onClick={openSmsCompose}
            label="SMS"
            disabled={!smsEnabled || !contactPhone}
            tooltip={
              !smsEnabled
                ? "Configure Twilio SMS in Netlify env vars"
                : !contactPhone
                  ? "Add a contact phone on the prospect first"
                  : undefined
            }
          />
          <ComposeButton
            icon={
              syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <Mail className="w-3.5 h-3.5" aria-hidden />
              )
            }
            onClick={onSyncEmails}
            label={syncing ? "Syncing…" : "Sync from Gmail"}
            disabled={!contactEmail || syncing}
            tooltip={
              contactEmail
                ? "Pull this contact's email history (last year) from your Gmail"
                : "Add a contact email on the prospect first"
            }
          />
          {syncMsg && (
            <span className="text-xs text-tbb-ink-3 self-center">{syncMsg}</span>
          )}
        </div>
      )}

      {composing && (
        <div
          ref={composerRef}
          className="px-5 py-4 border-b-2 border-tbb-blue/50 bg-tbb-cream-50 space-y-2 ring-2 ring-tbb-blue/20 ring-offset-0 scroll-mt-4"
        >
          <div className="flex items-center gap-2">
            <ChannelIcon channel={composing.channel} />
            <p className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              {composing.replyTo
                ? `Reply via ${composing.channel}`
                : `New ${composing.channel}`}
            </p>
            <button
              type="button"
              onClick={() => setComposing(null)}
              className="ml-auto text-tbb-ink-3 hover:text-tbb-navy"
              aria-label="Close composer"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              To {contactName ? `(${contactName})` : ""}
            </span>
            <input
              type="text"
              value={composing.to}
              onChange={(e) =>
                setComposing({ ...composing, to: e.target.value })
              }
              placeholder={
                composing.channel === "email" ? "name@company.com" : "+1 780 555 1234"
              }
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              disabled={isPending}
            />
          </label>
          {composing.channel === "email" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Cc
                </span>
                <input
                  type="text"
                  value={composing.cc ?? ""}
                  onChange={(e) =>
                    setComposing({ ...composing, cc: e.target.value })
                  }
                  placeholder="name@company.com"
                  className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                  disabled={isPending}
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Bcc
                </span>
                <input
                  type="text"
                  value={composing.bcc ?? ""}
                  onChange={(e) =>
                    setComposing({ ...composing, bcc: e.target.value })
                  }
                  placeholder="hidden@company.com"
                  className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                  disabled={isPending}
                />
              </label>
            </div>
          )}
          {composing.channel === "email" && (
            <>
              {emailTemplates.length > 0 && prospectId && (
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                    Use template (optional)
                  </span>
                  <select
                    value=""
                    onChange={async (e) => {
                      const tmplId = e.target.value;
                      if (!tmplId) return;
                      // Reset selection so picking the same template
                      // again re-applies it.
                      e.target.value = "";
                      const r = await resolveTemplateForProspect({
                        templateId: tmplId,
                        prospectId,
                      });
                      if (r.ok) {
                        setComposing({
                          ...composing,
                          subject: r.subject,
                          body: r.body,
                        });
                        // Load the template into the rich-text editor.
                        editorRef.current?.setMarkdown(r.body);
                      } else {
                        setError(r.error);
                      }
                    }}
                    disabled={isPending}
                    className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                  >
                    <option value="">— Pick a template —</option>
                    {emailTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.category !== "other" ? ` · ${t.category}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Subject
                </span>
                <input
                  type="text"
                  value={composing.subject}
                  onChange={(e) =>
                    setComposing({ ...composing, subject: e.target.value })
                  }
                  className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                  disabled={isPending}
                />
              </label>
            </>
          )}
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Message
            </span>
            {composing.channel === "email" ? (
              <div className="mt-1">
                <RichTextEditor
                  key={`${composing.channel}:${composing.replyTo?.id ?? "new"}`}
                  editorRef={editorRef}
                  initialMarkdown={composing.body}
                  placeholder="Write your message here. Sent from your connected Gmail account."
                  disabled={isPending}
                  onSubmit={submitCompose}
                  ariaLabel="Email body"
                />
              </div>
            ) : (
              <textarea
                rows={3}
                value={composing.body}
                onChange={(e) =>
                  setComposing({ ...composing, body: e.target.value })
                }
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
                disabled={isPending}
                placeholder={
                  composing.channel === "sms"
                    ? "Keep it short — SMS messages over 160 characters get split into multiple sends."
                    : "WhatsApp message text."
                }
              />
            )}
          </label>
          {composing.channel === "email" && (
            <div className="space-y-2">
              {composing.attachments.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {composing.attachments.map((a, i) => (
                    <li
                      key={i}
                      className="inline-flex items-center gap-1.5 text-[11px] bg-white border border-tbb-line rounded-pill px-2.5 py-1"
                    >
                      <Paperclip className="w-3 h-3 text-tbb-ink-3" aria-hidden />
                      <span className="font-bold text-tbb-navy">{a.filename}</span>
                      <span className="text-tbb-ink-3">
                        {formatBytes(a.sizeBytes)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        disabled={isPending}
                        aria-label={`Remove ${a.filename}`}
                        className="text-tbb-ink-3 hover:text-tbb-danger ml-0.5"
                      >
                        <X className="w-3 h-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:text-tbb-blue-700 cursor-pointer">
                <Paperclip className="w-3.5 h-3.5" aria-hidden />
                <span>Attach file</span>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    addAttachments(e.target.files);
                    e.target.value = "";
                  }}
                  disabled={isPending}
                  className="hidden"
                />
              </label>
            </div>
          )}
          {error && (
            <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-white">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submitCompose}
              disabled={
                isPending ||
                !composing.to.trim() ||
                !composing.body.trim() ||
                (composing.channel === "email" && !composing.subject.trim())
              }
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
            >
              {isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              )}
              Send {composing.channel}
            </button>
            <button
              type="button"
              onClick={() => setComposing(null)}
              disabled={isPending}
              className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="px-5 py-10 text-center space-y-2">
          <div className="text-3xl" aria-hidden>
            {filter === "email" ? "📨" : filter === "sms" ? "📱" : filter === "phone_call" ? "📞" : "💬"}
          </div>
          <p className="font-bold text-tbb-navy">
            {filter === "all"
              ? "No communications here — yet."
              : `No ${filter.replace("_", " ")} messages yet.`}
          </p>
          <p className="text-sm text-tbb-ink-3 max-w-md mx-auto">
            {readOnly
              ? "Once your Coach reaches out (or you reply), every message lands here. Audit trail you can actually trust."
              : "Send a quick email above, or log the call you just had from the activity panel. Inbound emails sync from Gmail every 10 minutes."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-tbb-line-soft">
          {filtered.map((r) => (
            <CommunicationItem
              key={r.id}
              row={r}
              onReply={
                !readOnly &&
                r.direction === "inbound" &&
                r.channel === "email"
                  ? () => openEmailCompose(r)
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </Wrapper>
  );
}

function ChannelTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-[10px] font-bold uppercase tracking-tbb-caps px-2.5 py-1 rounded-pill border " +
        (active
          ? "bg-tbb-navy text-tbb-cream border-tbb-navy"
          : "bg-white text-tbb-ink-3 border-tbb-line hover:bg-tbb-cream-50")
      }
    >
      {children}
    </button>
  );
}

function ComposeButton({
  icon,
  onClick,
  label,
  disabled,
  tooltip,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled: boolean;
  tooltip?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip ?? label}
      className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-white text-tbb-navy border border-tbb-line hover:bg-tbb-cream-50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {icon}
      {label}
    </button>
  );
}

/** Read a File as base64 (no data: prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected reader result"));
        return;
      }
      // result is "data:<mime>;base64,<payload>" — strip the prefix.
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function ChannelIcon({
  channel,
}: {
  channel: CommunicationRow["channel"] | "email" | "sms";
}) {
  switch (channel) {
    case "email":
      return <Mail className="w-4 h-4 text-tbb-blue" aria-hidden />;
    case "sms":
      return <Smartphone className="w-4 h-4 text-tbb-blue" aria-hidden />;
    case "phone_call":
      return <Phone className="w-4 h-4 text-tbb-blue" aria-hidden />;
    default:
      return <StickyNote className="w-4 h-4 text-tbb-blue" aria-hidden />;
  }
}

function CommunicationItem({
  row,
  onReply,
}: {
  row: CommunicationRow;
  onReply?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fullBody = row.body || "";
  // "Long" if the body is clamped by the 3-line preview — give the user a
  // way to read the whole thing. Without this the timeline only ever shows
  // a snippet, which reads as "I can't open the email".
  const isLong = fullBody.length > 200 || fullBody.split("\n").length > 3;
  return (
    <li className="px-5 py-3 hover:bg-tbb-cream-50">
      <div className="flex items-start gap-3">
        <span className="shrink-0 mt-0.5 grid place-items-center w-8 h-8 rounded-md bg-tbb-cream-50 text-tbb-ink-3">
          <ChannelIcon channel={row.channel} />
        </span>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              {row.channel.replace("_", " ")}
            </span>
            {row.direction === "inbound" ? (
              <ArrowDownLeft
                className="w-3 h-3 text-tbb-success"
                aria-hidden
              />
            ) : (
              <ArrowUpRight className="w-3 h-3 text-tbb-blue" aria-hidden />
            )}
            <span className="text-xs text-tbb-ink-2 truncate">
              {row.direction === "inbound"
                ? row.fromAddress ?? "(unknown sender)"
                : row.toAddresses.join(", ")}
            </span>
            <span className="ml-auto text-[11px] text-tbb-ink-3 whitespace-nowrap">
              {row.occurredAt.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          {row.subject && (
            <p className="text-sm text-tbb-navy font-bold">
              {row.subject}
            </p>
          )}
          <p
            className={
              "text-sm text-tbb-ink-2 whitespace-pre-wrap break-words" +
              (expanded ? "" : " line-clamp-3")
            }
          >
            {fullBody || row.subject || "(no message body)"}
          </p>
          <div className="flex items-center gap-3">
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
              >
                {expanded ? "Show less" : "Show full email"}
              </button>
            )}
            {onReply && (
              <button
                type="button"
                onClick={onReply}
                className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
              >
                Reply →
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
