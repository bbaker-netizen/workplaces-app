"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Send, Star, ClipboardList } from "lucide-react";
import {
  sendDiagnosticInvite,
  sendReviewRequest,
} from "@/lib/actions/quick-send";

type Channel = "email" | "sms" | "both";
type Result =
  | { ok: true; sentEmail: boolean; sentSms: boolean }
  | { ok: false; error: string };
type Action = (input: {
  name: string | null;
  email: string | null;
  phone: string | null;
  channel: Channel;
  message: string | null;
}) => Promise<Result>;

export function QuickSendTools() {
  return (
    <div className="space-y-6">
      <SendTool
        icon={<ClipboardList className="w-4 h-4 text-tbb-blue" aria-hidden />}
        title="Send the diagnostic"
        blurb="Email or text someone a link to your business diagnostic — no need to add them as a prospect first (a completed one lands in your Pipeline automatically)."
        cta="Send diagnostic"
        action={sendDiagnosticInvite}
        placeholderMsg="Optional note, e.g. 'Great chatting today — here's that quick assessment.'"
      />
      <SendTool
        icon={<Star className="w-4 h-4 text-tbb-warning" aria-hidden />}
        title="Request a Google review"
        blurb="Email or text a client your Google review link with a friendly ask."
        cta="Send review request"
        action={sendReviewRequest}
        placeholderMsg="Optional note, e.g. 'It's been a pleasure working together!'"
      />
    </div>
  );
}

function SendTool({
  icon,
  title,
  blurb,
  cta,
  action,
  placeholderMsg,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  cta: string;
  action: Action;
  placeholderMsg: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  function send() {
    setResult(null);
    startTransition(async () => {
      const r = await action({
        name: name.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        channel,
        message: message.trim() || null,
      });
      setResult(r);
      if (r.ok) {
        setName("");
        setEmail("");
        setPhone("");
        setMessage("");
      }
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-6 shadow-tbb-sm space-y-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-bold text-tbb-navy text-lg">
          {icon}
          {title}
        </h2>
        <p className="text-sm text-tbb-ink-3">{blurb}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block space-y-1">
          <span className={labelCls}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" disabled={pending} className={inputCls} />
        </label>
        <label className="block space-y-1">
          <span className={labelCls}>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@acme.com" disabled={pending} className={inputCls} />
        </label>
        <label className="block space-y-1">
          <span className={labelCls}>Phone (for text)</span>
          <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 780 555 1234" disabled={pending} className={inputCls} />
        </label>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <span className={labelCls}>Send via</span>
        {(["email", "sms", "both"] as Channel[]).map((c) => (
          <label key={c} className="flex items-center gap-1.5 text-sm">
            <input type="radio" name={`${title}-channel`} checked={channel === c} onChange={() => setChannel(c)} disabled={pending} />
            {c === "email" ? "Email" : c === "sms" ? "Text" : "Both"}
          </label>
        ))}
      </div>

      <label className="block space-y-1">
        <span className={labelCls}>Personal note (optional)</span>
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={placeholderMsg} disabled={pending} className={inputCls} />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={pending}
          className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
          {pending ? "Sending…" : cta}
        </button>
        {result?.ok && (
          <span className="inline-flex items-center gap-1 text-sm text-tbb-success">
            <Check className="w-4 h-4" aria-hidden />
            Sent{result.sentEmail && result.sentSms ? " (email + text)" : result.sentSms ? " (text)" : " (email)"}.
          </span>
        )}
        {result && !result.ok && <span className="text-sm text-tbb-danger">{result.error}</span>}
      </div>
    </section>
  );
}

const inputCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";
const labelCls =
  "text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3";
