"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Check, Loader2, Mail, Send } from "lucide-react";
import {
  sendBookingEmailNow,
  setBookingDocumentsReceived,
} from "@/lib/actions/booking-follow-through";
import type { BookingEmailNum } from "@/lib/booking/follow-through";

const TZ = "America/Edmonton";

type Props = {
  id: string;
  prospectId: string;
  sessionAtISO: string;
  email1SentAtISO: string | null;
  email2SentAtISO: string | null;
  email3SentAtISO: string | null;
  documentsReceived: boolean;
  cancelled: boolean;
};

const EMAILS: { n: BookingEmailNum; label: string; when: string }[] = [
  { n: 1, label: "Email 1 · NDA + paperwork", when: "As soon as booked" },
  { n: 2, label: "Email 2 · gentle nudge", when: "3 days before" },
  { n: 3, label: "Email 3 · morning of", when: "07:30 the day of" },
];

function fmt(iso: string | null): string | null {
  if (!iso) return null;
  return DateTime.fromISO(iso).setZone(TZ).toFormat("d LLL, h:mm a");
}

export function BookingFollowThroughPanel(props: Props) {
  const sentMap: Record<BookingEmailNum, string | null> = {
    1: props.email1SentAtISO,
    2: props.email2SentAtISO,
    3: props.email3SentAtISO,
  };
  const [docsReceived, setDocsReceived] = useState(props.documentsReceived);
  const [pending, startTransition] = useTransition();
  const [sendingN, setSendingN] = useState<BookingEmailNum | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionLabel = DateTime.fromISO(props.sessionAtISO)
    .setZone(TZ)
    .toFormat("cccc, d LLLL yyyy 'at' h:mm a");

  function toggleDocs() {
    setError(null);
    const next = !docsReceived;
    setDocsReceived(next); // optimistic
    startTransition(async () => {
      const r = await setBookingDocumentsReceived(
        props.id,
        next,
        props.prospectId,
      );
      if (!r.ok) {
        setDocsReceived(!next); // revert
        setError(r.error);
      }
    });
  }

  function sendNow(n: BookingEmailNum) {
    setError(null);
    setSendingN(n);
    startTransition(async () => {
      const r = await sendBookingEmailNow(props.id, n, props.prospectId);
      setSendingN(null);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm">
      <header className="px-5 py-3 border-b border-tbb-line-soft flex items-center gap-2">
        <Mail className="w-4 h-4 text-tbb-navy" aria-hidden />
        <div>
          <h2 className="font-bold text-tbb-navy">Booking follow-through</h2>
          <p className="text-[11px] text-tbb-ink-3 mt-0.5">
            Session: {sessionLabel}
          </p>
        </div>
      </header>

      <div className="px-5 py-4 space-y-3">
        {props.cancelled && (
          <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-danger">
            Cancelled — sequence stopped.
          </p>
        )}

        <ul className="space-y-2">
          {EMAILS.map(({ n, label, when }) => {
            const sentAt = fmt(sentMap[n]);
            const suppressed = docsReceived && n !== 1 && !sentMap[n];
            return (
              <li
                key={n}
                className="flex items-center justify-between gap-3 border border-tbb-line-soft rounded-md px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {label}
                  </p>
                  <p className="text-[11px] text-tbb-ink-3">{when}</p>
                </div>
                {sentAt ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-success whitespace-nowrap">
                    <Check className="w-3.5 h-3.5" aria-hidden /> Sent {sentAt}
                  </span>
                ) : suppressed ? (
                  <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 whitespace-nowrap">
                    Paused
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => sendNow(n)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {sendingN === n ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Send className="w-3.5 h-3.5" aria-hidden />
                    )}
                    Send now
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={docsReceived}
            onChange={toggleDocs}
            disabled={pending}
            className="w-4 h-4 accent-tbb-blue"
          />
          <span className="text-sm text-foreground">
            Documents received
            <span className="text-tbb-ink-3">
              {" "}
              — stops the remaining reminders
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-tbb-danger">{error}</p>}
      </div>
    </section>
  );
}
