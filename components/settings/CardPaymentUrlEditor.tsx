"use client";

/**
 * The practice's hosted card payment page.
 *
 * A LINK, deliberately — not a card form. Card numbers go straight to
 * QuickBooks Payments or Stripe and never touch this application, which
 * keeps card data and the PCI obligations that follow it out of a
 * coaching practice's database.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { saveCardPaymentUrl } from "@/lib/actions/qbo-billing";

export function CardPaymentUrlEditor({ current }: { current: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(current ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3">
      <div className="space-y-1">
        <h2 className="font-bold text-foreground text-lg tracking-tight">
          Card payment link
        </h2>
        <p className="font-sans text-sm text-tbb-ink-2">
          Your hosted payment page from QuickBooks Payments or Stripe. The
          Builder never collects card numbers &mdash; clients are sent here
          instead, so the details go straight to your processor.
        </p>
      </div>
      <input
        type="url"
        value={url}
        placeholder="https://…"
        onChange={(e) => setUrl(e.target.value)}
        disabled={isPending}
        className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
      />
      <button
        type="button"
        onClick={() => {
          setMsg(null);
          start(async () => {
            const r = await saveCardPaymentUrl({ url });
            setMsg(r.ok ? "Saved." : r.error);
            if (r.ok) router.refresh();
          });
        }}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <Save className="w-3.5 h-3.5" aria-hidden />
        )}
        Save
      </button>
      {msg && <p className="font-sans text-xs text-tbb-ink-2">{msg}</p>}
    </section>
  );
}
