"use client";

/**
 * Marketing-list importer. Upload (or paste) a CSV export from WordPress /
 * Formidable, preview what will be added — de-duped by email, with anyone
 * already in the pipeline flagged — then import. Two-step so nothing lands
 * until Bruce has eyeballed the preview.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import {
  importMarketingContacts,
  previewMarketingImport,
  type ImportSummary,
} from "@/lib/actions/marketing-contacts";

export function MarketingImport() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [source, setSource] = useState("WordPress");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSummary(null);
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ""));
      setFileName(file.name);
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
  }

  function preview() {
    setError(null);
    startTransition(async () => {
      const r = await previewMarketingImport({ csv, source });
      if (!r.ok) setError(r.error);
      else setSummary(r.data);
    });
  }

  function doImport() {
    setError(null);
    startTransition(async () => {
      const r = await importMarketingContacts({ csv, source });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSummary(r.data);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className={labelCls}>Upload the CSV export</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-md border border-tbb-line bg-white hover:border-tbb-blue"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden /> Choose file
            </button>
            <span className="text-xs text-tbb-ink-3 truncate">
              {fileName ?? "No file chosen"}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="hidden"
            />
          </div>
        </label>
        <label className="block space-y-1">
          <span className={labelCls}>Source label</span>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </label>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-tbb-blue font-bold">
          …or paste the CSV instead
        </summary>
        <textarea
          rows={6}
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setFileName(null);
            setSummary(null);
          }}
          placeholder="Paste the CSV contents here (including the header row)…"
          className="mt-2 w-full font-mono text-xs bg-white border border-tbb-line rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
      </details>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={preview}
          disabled={isPending || !csv.trim()}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-blue-100 disabled:opacity-50"
        >
          {isPending && !summary?.applied ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : null}
          Preview
        </button>
        {summary && !summary.applied && summary.toAdd > 0 && (
          <button
            type="button"
            onClick={doImport}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : null}
            Import {summary.toAdd} contact{summary.toAdd === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-tbb-danger">{error}</p>}

      {summary && (
        <div className="rounded-lg border border-tbb-line bg-tbb-cream-50 p-4 space-y-3">
          {summary.applied ? (
            <p className="flex items-center gap-2 text-sm font-bold text-tbb-navy">
              <CheckCircle2 className="w-4 h-4 text-tbb-success" aria-hidden />
              Imported {summary.added} contact
              {summary.added === 1 ? "" : "s"} into the marketing list.
            </p>
          ) : (
            <p className="text-sm font-bold text-tbb-navy">
              Preview — nothing saved yet.
            </p>
          )}

          <div className="text-xs text-tbb-ink-3 space-y-1">
            <p>
              Detected columns — Name:{" "}
              <b>{summary.mapping.name ?? "—"}</b>, Email:{" "}
              <b>{summary.mapping.email ?? "—"}</b>, Phone:{" "}
              <b>{summary.mapping.phone ?? "—"}</b>, Company:{" "}
              <b>{summary.mapping.company ?? "—"}</b>
            </p>
          </div>

          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <Stat label="Rows in file" value={summary.totalRows} />
            <Stat label={summary.applied ? "Added" : "To add"} value={summary.applied ? summary.added : summary.toAdd} accent />
            <Stat label="Already in list" value={summary.alreadyInList} />
            <Stat label="Duplicates in file" value={summary.duplicatesInFile} />
            <Stat label="Invalid email" value={summary.invalidEmail} />
            <Stat
              label="Also in pipeline"
              value={summary.toAddMatchingProspect}
            />
          </ul>

          {!summary.applied && summary.sample.length > 0 && (
            <div className="text-xs">
              <p className={labelCls}>Sample of what will be added</p>
              <ul className="mt-1 space-y-0.5 text-tbb-ink-2">
                {summary.sample.map((s) => (
                  <li key={s.email} className="truncate">
                    {s.name ? `${s.name} · ` : ""}
                    {s.email}
                    {s.phone ? ` · ${s.phone}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <li className="rounded-md bg-white border border-tbb-line px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        {label}
      </p>
      <p
        className={
          "font-bold tabular-nums text-lg " +
          (accent ? "text-tbb-orange" : "text-tbb-navy")
        }
      >
        {value}
      </p>
    </li>
  );
}

const labelCls =
  "text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3";
