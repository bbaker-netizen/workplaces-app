"use client";

import { useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { importLeads, type ImportResult } from "@/lib/actions/import-leads";

export function LeadImporter() {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  function go(apply: boolean) {
    startTransition(async () => {
      setResult(await importLeads(text, apply));
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-6 shadow-tbb-sm space-y-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-bold text-tbb-navy text-lg">
          <Upload className="w-4 h-4 text-tbb-blue" aria-hidden />
          Import / update leads
        </h2>
        <p className="text-sm text-tbb-ink-3">
          Paste rows from a spreadsheet or CSV (needs at least an <strong>email</strong>;
          <strong> name</strong> and <strong>phone</strong> optional). It matches by
          email and fills in <strong>only missing</strong> phone/name — it never
          overwrites existing values and <strong>never touches notes</strong>. Emails
          it can&apos;t match become new Facebook-Ads leads. Preview first, then apply.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"Name\tEmail\tPhone\nIbiwangi M Oladipo\tibimdipo@gmail.com\t17806070914"}
        disabled={pending}
        className="w-full font-mono text-xs bg-tbb-cream-50 border border-tbb-line rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => go(false)}
          disabled={pending || !text.trim()}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill border border-tbb-navy text-tbb-navy hover:bg-tbb-bg-soft disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
          Preview
        </button>
        <button
          type="button"
          onClick={() => go(true)}
          disabled={pending || !text.trim() || !(result && result.ok)}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
        >
          Apply changes
        </button>
      </div>

      {result && !result.ok && (
        <p className="text-sm text-tbb-danger">{result.error}</p>
      )}
      {result && result.ok && (
        <div className="rounded-lg border border-tbb-line bg-tbb-cream/40 p-4 space-y-2 text-sm">
          <p className="font-bold text-tbb-navy">
            {result.applied ? "Applied." : "Preview (nothing saved yet)."}
          </p>
          <ul className="text-tbb-ink-2 space-y-0.5">
            <li>Rows parsed: <strong>{result.parsed}</strong></li>
            <li>Phones to fill: <strong>{result.phonesFilled}</strong></li>
            <li>Names to fill: <strong>{result.namesFilled}</strong></li>
            <li>New leads: <strong>{result.newLeads}</strong></li>
            <li>Already complete (untouched): <strong>{result.alreadyComplete}</strong></li>
          </ul>
          {result.notes.length > 0 && (
            <details className="text-xs text-tbb-ink-3">
              <summary className="cursor-pointer font-bold">What changes ({result.notes.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {result.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          {!result.applied && (
            <p className="text-xs text-tbb-ink-3">
              Looks right? Click <strong>Apply changes</strong> to write it.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
