"use client";

/**
 * Send a client the pre-authorized debit form, and hand them the card
 * payment link.
 *
 * Two different mechanisms on purpose. The PAD form is collected here,
 * because a bank needs a signed authorization on file. Card details are
 * NOT — that button opens the practice's hosted payment page, so the card
 * number goes straight to the processor and never touches this app.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, Loader2 } from "lucide-react";
import { requestPaymentAuthorization } from "@/lib/actions/payment-authorization";

export function RequestPaymentAuthorizationPanel({
  prospectId,
  engagementId,
  defaultName,
  defaultEmail,
  cardPaymentUrl,
}: {
  prospectId?: string | null;
  engagementId?: string | null;
  defaultName: string;
  defaultEmail: string;
  cardPaymentUrl: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPending, start] = useTransition();

  function send() {
    setMsg(null);
    start(async () => {
      const r = await requestPaymentAuthorization({
        prospectId: prospectId ?? null,
        engagementId: engagementId ?? null,
        signerName: name,
        signerEmail: email,
      });
      if (r.ok) {
        setSent(true);
        setOpen(false);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3">
      <div className="space-y-1">
        <h3 className="font-bold text-foreground tracking-tight">
          Payment setup
        </h3>
        <p className="font-sans text-sm text-tbb-ink-2">
          Pre-authorized debit is signed in-app and files itself. Card
          payment goes through your payment provider, so card numbers never
          reach The Builder.
        </p>
      </div>

      {sent ? (
        <p className="font-sans text-sm text-tbb-blue font-bold">
          PAD form sent to {email}.
        </p>
      ) : open ? (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
              Account holder
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
          </label>
          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
              Their email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={send}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
            >
              {isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              )}
              Send PAD form
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors"
          >
            <Banknote className="w-3.5 h-3.5" aria-hidden /> Send PAD form
          </button>
          {cardPaymentUrl ? (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(cardPaymentUrl);
                setCopied(true);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors"
            >
              {copied ? (
                <>Copied</>
              ) : (
                <>
                  <CreditCard className="w-3.5 h-3.5" aria-hidden /> Copy card
                  payment link
                </>
              )}
            </button>
          ) : (
            <span className="font-sans text-xs text-tbb-ink-3">
              <CreditCard className="w-3.5 h-3.5 inline mr-1" aria-hidden />
              Add your card payment link under Settings &rarr; QuickBooks
              billing.
            </span>
          )}
        </div>
      )}

      {msg && <p className="font-sans text-xs text-tbb-danger">{msg}</p>}
    </section>
  );
}
