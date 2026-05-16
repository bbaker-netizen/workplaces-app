"use client";

/**
 * Email signature editor — plain text block appended to every email
 * sent from the communications panel. Bruce can paste in whatever he
 * has at the bottom of his Gmail (name, title, phone, disclaimer).
 */

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setEmailSignature } from "@/lib/actions/user-prefs";

const STARTER = `Bruce Baker
Business Builder · Workplaces
+1 780-555-1234
bruce@4workplaces.com

CONFIDENTIALITY NOTICE: This email and any attachments are confidential. If you received this in error, please reply to let me know and delete.`;

export function EmailSignatureEditor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await setEmailSignature(value);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Signature text
        </span>
        <textarea
          rows={8}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isPending}
          placeholder={STARTER}
          className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
        />
      </label>
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
          {isPending && (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          )}
          Save signature
        </button>
        {saved && (
          <span className="text-[11px] text-tbb-success font-bold">
            ✓ Saved. New emails will include this.
          </span>
        )}
        {!value && (
          <button
            type="button"
            onClick={() => setValue(STARTER)}
            className="text-[11px] text-tbb-blue hover:underline"
          >
            Use a starter template
          </button>
        )}
      </div>
    </div>
  );
}
