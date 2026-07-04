"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Phone } from "lucide-react";
import {
  applyFacebookLeadFixes,
  previewFacebookLeadFixes,
  type LeadFixResult,
} from "@/lib/actions/fix-facebook-leads";

export function FacebookLeadFixer() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LeadFixResult | null>(null);

  function preview() {
    startTransition(async () => setResult(await previewFacebookLeadFixes()));
  }
  function apply() {
    startTransition(async () => setResult(await applyFacebookLeadFixes()));
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-6 shadow-tbb-sm space-y-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-bold text-tbb-navy text-lg">
          <Phone className="w-4 h-4 text-tbb-blue" aria-hidden />
          Fix the 29 Facebook lead phone numbers
        </h2>
        <p className="text-sm text-tbb-ink-3">
          Sets the correct phone number (from your leads export) and lead
          source <strong>Facebook Ads</strong> on each of the 29 Facebook
          leads, matched by <strong>email</strong>. It writes{" "}
          <strong>only</strong> the phone and lead source — it never changes
          names, emails, notes, stage, or anything else. Preview to see every
          current → corrected value, then apply.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={preview}
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
          onClick={apply}
          disabled={pending || !(result && result.ok)}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
        >
          <Check className="w-3.5 h-3.5" aria-hidden />
          Apply corrections
        </button>
      </div>

      {result && !result.ok && (
        <p className="text-sm text-tbb-danger">{result.error}</p>
      )}

      {result && result.ok && (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-tbb-line bg-tbb-cream/40 p-4 space-y-1">
            <p className="font-bold text-tbb-navy">
              {result.applied
                ? "Applied."
                : "Preview (nothing saved yet)."}
            </p>
            <ul className="text-tbb-ink-2 space-y-0.5">
              <li>Matched in the app: <strong>{result.matched}</strong> of 29</li>
              <li>
                Phone numbers {result.applied ? "corrected" : "to correct"}:{" "}
                <strong>{result.phonesFixed}</strong>
              </li>
              <li>
                Lead source {result.applied ? "set" : "to set"} to Facebook Ads:{" "}
                <strong>{result.sourcesFixed}</strong>
              </li>
              {result.notFound > 0 && (
                <li className="text-tbb-ink-3">
                  Not found in the app (left untouched):{" "}
                  <strong>{result.notFound}</strong>
                </li>
              )}
            </ul>
            {!result.applied && result.matched > 0 && (
              <p className="text-xs text-tbb-ink-3 pt-1">
                Looks right? Click <strong>Apply corrections</strong> to save.
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-tbb-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-tbb-cream/60 text-tbb-ink-3 uppercase tracking-tbb-caps text-[10px]">
                  <th className="text-left px-3 py-2">Lead</th>
                  <th className="text-left px-3 py-2">Current phone</th>
                  <th className="text-left px-3 py-2">Correct phone</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr
                    key={r.email}
                    className="border-t border-tbb-line-soft align-top"
                  >
                    <td className="px-3 py-2">
                      <p className="font-bold text-tbb-navy">
                        {r.company ?? r.name}
                        {r.matchedBy === "name" && (
                          <span className="ml-2 text-[10px] font-normal uppercase tracking-tbb-caps text-tbb-warning">
                            matched by name
                          </span>
                        )}
                      </p>
                      <p className="text-tbb-ink-3">{r.email}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-tbb-ink-3">
                      {r.currentPhone || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-tbb-navy">
                      {r.newPhone}
                    </td>
                    <td className="px-3 py-2">
                      {!r.found ? (
                        <span className="text-tbb-ink-3">Not in app</span>
                      ) : r.phoneChanges || r.sourceChanges ? (
                        <span className="text-tbb-blue font-bold">
                          {result.applied ? "Fixed" : "Will fix"}
                        </span>
                      ) : (
                        <span className="text-tbb-ink-3">Already correct</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
