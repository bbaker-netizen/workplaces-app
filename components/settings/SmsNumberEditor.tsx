"use client";

/**
 * Per-Builder SMS number editor. Each Business Builder enters the Twilio
 * number assigned to them; their outbound texts then send from it so
 * clients see them, not the shared practice number.
 */

import { useState, useTransition } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { setSmsFromNumber } from "@/lib/actions/user-prefs";

export function SmsNumberEditor({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await setSmsFromNumber(value);
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
        <MessageSquare className="w-3.5 h-3.5" aria-hidden />
        {value.trim().length > 0
          ? "Your texts send from this number."
          : "No number yet — texts fall back to the shared practice number."}
      </div>
      <input
        type="tel"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+17809830722"
        autoComplete="off"
        className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-tbb-blue"
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
          Save number
        </button>
        {saved && (
          <span className="text-[11px] text-tbb-success font-bold">
            ✓ Saved. Your texts now send from this number.
          </span>
        )}
      </div>
    </div>
  );
}
