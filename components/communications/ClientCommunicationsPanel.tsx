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

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Mail,
  Phone,
  Smartphone,
  StickyNote,
  X,
} from "lucide-react";
import { sendClientMessage } from "@/lib/actions/send-client-message";
import type { CommunicationRow } from "@/lib/db/queries/client-communications";

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
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Channel>("all");
  const [composing, setComposing] = useState<null | {
    channel: "email" | "sms";
    to: string;
    subject: string;
    body: string;
    replyTo?: CommunicationRow;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.channel === filter);
  }, [rows, filter]);

  function openEmailCompose(replyTo?: CommunicationRow) {
    setError(null);
    setComposing({
      channel: "email",
      to: replyTo?.fromAddress ?? contactEmail ?? "",
      subject: replyTo?.subject
        ? replyTo.subject.startsWith("Re: ")
          ? replyTo.subject
          : `Re: ${replyTo.subject}`
        : "",
      body: "",
      replyTo,
    });
  }
  function openSmsCompose() {
    setError(null);
    setComposing({
      channel: "sms",
      to: contactPhone ?? "",
      subject: "",
      body: "",
    });
  }

  function submitCompose() {
    if (!composing) return;
    setError(null);
    startTransition(async () => {
      const r = await sendClientMessage({
        prospectId: prospectId ?? null,
        engagementId: engagementId ?? null,
        channel: composing.channel,
        to: [composing.to],
        subject: composing.channel === "email" ? composing.subject : null,
        body: composing.body,
        inReplyTo:
          composing.replyTo?.externalId && composing.channel === "email"
            ? composing.replyTo.externalId
            : null,
        references: composing.replyTo?.threadKey ?? null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setComposing(null);
      router.refresh();
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm">
      <header className="border-b border-tbb-line-soft px-5 py-3 flex items-center gap-3 flex-wrap">
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Communications
        </h2>
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
        </div>
      )}

      {composing && (
        <div className="px-5 py-4 border-b border-tbb-line-soft bg-tbb-cream-50 space-y-2">
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
          )}
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Message
            </span>
            <textarea
              rows={composing.channel === "email" ? 6 : 3}
              value={composing.body}
              onChange={(e) =>
                setComposing({ ...composing, body: e.target.value })
              }
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
              disabled={isPending}
              placeholder={
                composing.channel === "email"
                  ? "Write your message here. Sent from your connected Gmail account."
                  : composing.channel === "sms"
                    ? "Keep it short — SMS messages over 160 characters get split into multiple sends."
                    : "WhatsApp message text."
              }
            />
          </label>
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
              ? "Once your Business Builder reaches out (or you reply), every message lands here. Audit trail you can actually trust."
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
    </section>
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
  const preview = (row.body || row.subject || "").slice(0, 280);
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
            <p className="text-sm text-tbb-navy font-bold truncate">
              {row.subject}
            </p>
          )}
          <p className="text-sm text-tbb-ink-2 whitespace-pre-wrap line-clamp-3">
            {preview}
          </p>
          {onReply && (
            <div>
              <button
                type="button"
                onClick={onReply}
                className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
              >
                Reply →
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
