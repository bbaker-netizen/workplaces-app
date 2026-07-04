"use client";

import { useState, useTransition } from "react";
import { Loader2, Wrench } from "lucide-react";
import {
  cleanupImportedPhones,
  type PhoneCleanupResult,
} from "@/lib/actions/import-leads";

export function PhoneCleanup() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PhoneCleanupResult | null>(null);

  function go(apply: boolean) {
    startTransition(async () => {
      setResult(await cleanupImportedPhones(apply));
    });
  }

  return (
    <section className="border border-tbb-warning/50 rounded-lg bg-tbb-warning/5 p-6 shadow-tbb-sm space-y-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-bold text-tbb-navy text-lg">
          <Wrench className="w-4 h-4 text-tbb-warning" aria-hidden />
          Fix phone numbers from a bad import
        </h2>
        <p className="text-sm text-tbb-ink-3">
          If an earlier import put <strong>dates or times</strong> into the phone
          column, this finds every prospect whose &quot;phone&quot; is really a
          date/time and clears it back to empty. It <strong>only</strong> touches
          those junk values — real phone numbers, names, notes, and everything
          else are left exactly as they are. Preview first, then apply.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => go(false)}
          disabled={pending}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill border border-tbb-navy text-tbb-navy hover:bg-tbb-bg-soft disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : null}
          Preview
        </button>
        <button
          type="button"
          onClick={() => go(true)}
          disabled={pending || !(result && result.ok)}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-warning text-tbb-navy hover:brightness-95 disabled:opacity-50 shadow-tbb-cta"
        >
          Clear the bad phone values
        </button>
      </div>

      {result && !result.ok && (
        <p className="text-sm text-tbb-danger">{result.error}</p>
      )}
      {result && result.ok && (
        <div className="rounded-lg border border-tbb-line bg-white p-4 space-y-2 text-sm">
          <p className="font-bold text-tbb-navy">
            {result.applied
              ? `Cleared ${result.cleared} bad phone value(s).`
              : `Found ${result.cleared} bad phone value(s) (nothing changed yet).`}
          </p>
          {result.cleared === 0 ? (
            <p className="text-tbb-ink-3">
              Nothing to fix — no date/time values found in the phone column.
            </p>
          ) : (
            <>
              {result.samples.length > 0 && (
                <details className="text-xs text-tbb-ink-3">
                  <summary className="cursor-pointer font-bold">
                    What will be cleared ({result.samples.length}
                    {result.cleared > result.samples.length ? "+" : ""})
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    {result.samples.map((s, i) => (
                      <li key={i}>
                        <span className="font-bold text-tbb-navy">
                          {s.company}
                        </span>
                        : <span className="font-mono">{s.badPhone}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {!result.applied && (
                <p className="text-xs text-tbb-ink-3">
                  Looks right? Click{" "}
                  <strong>Clear the bad phone values</strong> to fix them.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
