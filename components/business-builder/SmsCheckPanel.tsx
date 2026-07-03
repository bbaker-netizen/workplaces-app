"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, MessageSquare, X } from "lucide-react";
import { sendTestSms } from "@/lib/actions/sms-test";

export function SmsCheckPanel({ configured }: { configured: boolean }) {
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { ok: true } | { ok: false; error: string } | null
  >(null);

  function send() {
    setResult(null);
    startTransition(async () => {
      setResult(await sendTestSms(phone));
    });
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div
        className={
          "flex items-center gap-2 rounded-lg border px-4 py-3 " +
          (configured
            ? "border-tbb-success/40 bg-tbb-success/10"
            : "border-tbb-warning/40 bg-tbb-warning/10")
        }
      >
        <MessageSquare
          className={
            "w-4 h-4 shrink-0 " +
            (configured ? "text-tbb-success" : "text-tbb-warning")
          }
          aria-hidden
        />
        <span className="text-sm text-tbb-ink-2">
          {configured ? (
            <>
              <strong className="text-tbb-navy">SMS is connected.</strong>{" "}
              Text messages send from your account&apos;s shared number. Send
              yourself a test below to confirm.
            </>
          ) : (
            <>
              <strong className="text-tbb-navy">SMS isn&apos;t set up yet.</strong>{" "}
              Texting (Twilio) is configured once for the whole account by a
              master admin — it isn&apos;t something you set up yourself.
            </>
          )}
        </span>
      </div>

      {/* Test send */}
      {configured && (
        <div className="space-y-2">
          <label className="block space-y-1 max-w-sm">
            <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Send a test to your phone
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 780 555 1234"
              inputMode="tel"
              disabled={pending}
              className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={send}
              disabled={pending || !phone.trim()}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <MessageSquare className="w-3.5 h-3.5" aria-hidden />
              )}
              {pending ? "Sending…" : "Send test SMS"}
            </button>
            {result?.ok && (
              <span className="inline-flex items-center gap-1 text-sm text-tbb-success">
                <Check className="w-4 h-4" aria-hidden /> Sent — check your
                phone.
              </span>
            )}
            {result && !result.ok && (
              <span className="inline-flex items-center gap-1 text-sm text-tbb-danger">
                <X className="w-4 h-4" aria-hidden /> {result.error}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
