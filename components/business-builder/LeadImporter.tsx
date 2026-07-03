"use client";

import { useRef, useState, useTransition } from "react";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { importLeads, type ImportResult } from "@/lib/actions/import-leads";

/** Turn a picked spreadsheet/CSV file into the tab-separated text the
 *  server-side importer already understands. .xlsx is parsed in the
 *  browser via read-excel-file (loaded on demand so it never ships in
 *  the main bundle); .csv / .tsv / .txt are read as plain text. */
async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(file);
    return rows
      .map((row) =>
        row
          .map((cell) => {
            if (cell === null || cell === undefined) return "";
            if (cell instanceof Date) return cell.toISOString().slice(0, 10);
            return String(cell);
          })
          .join("\t"),
      )
      .join("\n");
  }
  // CSV / TSV / plain text — the importer auto-detects the delimiter.
  return file.text();
}

export function LeadImporter() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ingestFile(file: File) {
    setParseError(null);
    setResult(null);
    setParsing(true);
    try {
      const parsed = await fileToText(file);
      setText(parsed);
      setFileName(file.name);
      if (!parsed.trim()) {
        setParseError("That file looks empty — no rows found.");
      }
    } catch {
      setParseError(
        "Couldn't read that file. Make sure it's an .xlsx or .csv exported from your spreadsheet.",
      );
      setText("");
      setFileName(null);
    } finally {
      setParsing(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void ingestFile(file);
    // Reset so picking the same file again re-triggers onChange.
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void ingestFile(file);
  }

  function clearFile() {
    setText("");
    setFileName(null);
    setParseError(null);
    setResult(null);
  }

  function go(apply: boolean) {
    startTransition(async () => {
      setResult(await importLeads(text, apply));
    });
  }

  const busy = pending || parsing;
  const hasData = Boolean(text.trim());

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-6 shadow-tbb-sm space-y-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-bold text-tbb-navy text-lg">
          <Upload className="w-4 h-4 text-tbb-blue" aria-hidden />
          Import / update leads
        </h2>
        <p className="text-sm text-tbb-ink-3">
          Upload a spreadsheet (<strong>.xlsx</strong>) or CSV that has at least
          an <strong>email</strong> column (<strong>name</strong> and{" "}
          <strong>phone</strong> optional). It matches by email and fills in{" "}
          <strong>only missing</strong> phone/name — it never overwrites existing
          values and <strong>never touches notes</strong>. Rows it can&apos;t
          match become new Facebook-Ads leads. Preview first, then apply.
        </p>
      </div>

      {/* Upload dropzone */}
      {!fileName ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          className={
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors " +
            (dragging
              ? "border-tbb-blue bg-tbb-blue-50"
              : "border-tbb-line bg-tbb-cream-50 hover:border-tbb-blue hover:bg-tbb-blue-50/40")
          }
        >
          {parsing ? (
            <Loader2 className="w-6 h-6 text-tbb-blue animate-spin" aria-hidden />
          ) : (
            <FileSpreadsheet className="w-6 h-6 text-tbb-blue" aria-hidden />
          )}
          <p className="text-sm font-bold text-tbb-navy">
            {parsing
              ? "Reading your file…"
              : "Drop your file here, or click to choose"}
          </p>
          <p className="text-xs text-tbb-ink-3">
            Excel (.xlsx) or CSV · straight from your leads export
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onPick}
            className="hidden"
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-tbb-line bg-tbb-cream/40 px-4 py-3">
          <FileSpreadsheet
            className="w-5 h-5 text-tbb-blue shrink-0"
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-tbb-navy truncate">
              {fileName}
            </p>
            <p className="text-xs text-tbb-ink-3">
              {text.split(/\r?\n/).filter((l) => l.trim()).length} row(s) read —
              Preview to see what changes.
            </p>
          </div>
          <button
            type="button"
            onClick={clearFile}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-danger disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" aria-hidden /> Remove
          </button>
        </div>
      )}

      {parseError && <p className="text-sm text-tbb-danger">{parseError}</p>}

      {/* Manual-paste fallback for anyone who'd rather paste rows. */}
      <div>
        <button
          type="button"
          onClick={() => setShowPaste((s) => !s)}
          className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
        >
          {showPaste ? "Hide manual paste" : "Or paste rows manually instead"}
        </button>
        {showPaste && (
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName(null);
              setResult(null);
            }}
            rows={8}
            placeholder={
              "Name\tEmail\tPhone\nIbiwangi M Oladipo\tibimdipo@gmail.com\t17806070914"
            }
            disabled={busy}
            className="mt-2 w-full font-mono text-xs bg-tbb-cream-50 border border-tbb-line rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => go(false)}
          disabled={busy || !hasData}
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
          disabled={busy || !hasData || !(result && result.ok)}
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
              <summary className="cursor-pointer font-bold">
                What changes ({result.notes.length})
              </summary>
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
