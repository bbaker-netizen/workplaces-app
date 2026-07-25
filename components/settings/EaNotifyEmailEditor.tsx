"use client";

/**
 * Per-Builder assistant email. Where the morning briefing, recap
 * approvals, and the Friday rollup land.
 *
 * Blank falls back to the account email, so this only needs touching
 * when the sign-in address is not the inbox actually watched.
 */

import { useState, useTransition } from "react";
import { Loader2, Inbox } from "lucide-react";
import { setEaNotifyEmail } from "@/lib/actions/user-prefs";

export function EaNotifyEmailEditor({
  initial = "",
  accountEmail,
}: {
  initial?: string;
  accountEmail: string;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const effective = value.trim().length > 0 ? value.trim() : accountEmail;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await setEaNotifyEmail(value);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-tbb-ink-3">
        <Inbox className="w-3.5 h-3.5" aria-hidden />
        Your assistant currently writes to{" "}
        <span className="font-bold text-tbb-navy">{effective}</span>
      </div>
      <input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={accountEmail}
        autoComplete="off"
        className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
      />
      {error && (
        <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-tbb-cream-50">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
        >
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
          Save address
        </button>
        {saved && (
          <span className="text-[11px] text-tbb-success font-bold">
            ✓ Saved. Your briefing goes here from tomorrow.
          </span>
        )}
      </div>
      <p className="text-[11px] text-tbb-ink-3">
        Leave blank to use your account email ({accountEmail}).
      </p>
    </div>
  );
}
