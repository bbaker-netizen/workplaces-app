"use client";

/**
 * The PDF editor — markup tools, page navigation, and the two write paths.
 *
 * Bruce's Acrobat replacement for the work he actually does: mark a document
 * up, and change the pages when needed. Everything here runs in the browser
 * against a PDF fetched through the app's authenticated download route, so no
 * client document is uploaded anywhere new to be edited.
 *
 * SAVES ARE OPTIMISTIC, AND THE ID COMES FROM HERE. Each mark gets a UUID
 * minted client-side, is added to local state immediately, and is then written
 * with that id. Drawing therefore never waits on a round trip, a failed save
 * removes exactly the mark that failed, and a retry is an upsert rather than a
 * duplicate.
 *
 * BOTH WRITE PATHS PRODUCE A NEW VERSION and navigate to it. The document
 * being edited is never overwritten — which is what makes it safe to open a
 * signed contract in here.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  Highlighter,
  Loader2,
  MousePointer2,
  PenLine,
  RotateCw,
  Scissors,
  Square,
  Stamp,
  Strikethrough,
  Trash2,
  Type,
} from "lucide-react";
import {
  clearAnnotations,
  deleteAnnotation,
  saveAnnotation,
} from "@/lib/actions/document-annotations";
import { applyPdfPageOps, exportMarkedUpPdf } from "@/lib/actions/pdf-editor";
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_STROKE_WIDTH,
  MARKUP_COLORS,
  type MarkupAnnotation,
} from "@/lib/pdf/annotations";
import { parsePageRange } from "@/lib/pdf/ranges";
import { PdfPageSurface, type Tool } from "./PdfPageSurface";

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const TOOLS: Array<{
  tool: Tool;
  label: string;
  Icon: typeof Type;
}> = [
  { tool: "select", label: "Select", Icon: MousePointer2 },
  { tool: "text", label: "Text", Icon: Type },
  { tool: "highlight", label: "Highlight", Icon: Highlighter },
  { tool: "ink", label: "Pen", Icon: PenLine },
  { tool: "box", label: "Box", Icon: Square },
  { tool: "strikeout", label: "Strikethrough", Icon: Strikethrough },
  { tool: "whiteout", label: "White out", Icon: Eraser },
  { tool: "image", label: "Signature", Icon: Stamp },
];

export function PdfMarkupEditor({
  documentId,
  engagementId,
  filename,
  initialAnnotations,
  stampImage,
}: {
  documentId: string;
  engagementId: string;
  filename: string;
  initialAnnotations: MarkupAnnotation[];
  stampImage: string | null;
}) {
  const router = useRouter();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);

  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>(MARKUP_COLORS[0].hex);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);

  const [annotations, setAnnotations] =
    useState<MarkupAnnotation[]>(initialAnnotations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const fileUrl = `/api/documents/${documentId}/download`;

  // ---- open the document ----------------------------------------------

  useEffect(() => {
    let cancelled = false;
    // The LOADING TASK owns the worker, and it is the thing with a public
    // `destroy()` in pdf.js v6 — the document proxy only exposes `cleanup()`,
    // which frees parsed pages but leaves the worker running.
    let task: { destroy: () => Promise<void> } | null = null;

    (async () => {
      try {
        // PINNED TO pdfjs-dist 5.4.x ON PURPOSE — do not bump to 6.x without
        // testing in a real browser first. 6.2.108 calls
        // `Map.prototype.getOrInsertComputed`, which only exists in Chrome 142+
        // (and equivalents), in BOTH its modern and legacy builds, with no
        // polyfill. On anything older the library throws
        // `TypeError: ...getOrInsertComputed is not a function` before the
        // first page renders, so the editor fails to open entirely rather than
        // degrading. Verified empirically: 6.2.108 throws in Chromium 141,
        // 5.4.149 renders and round-trips coordinates exactly.
        const pdfjs = await import("pdfjs-dist");
        // Served from `public/`, copied there by scripts/copy-pdf-worker.mjs.
        // Letting webpack emit it via `new URL(…, import.meta.url)` compiles,
        // then fails the build when Terser minifies the emitted asset as a
        // classic script — the worker's own `import.meta` becomes a syntax
        // error. See that script's header for the full reasoning.
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const loadingTask = pdfjs.getDocument({
          url: fileUrl,
          // Same-origin, but the route is cookie-authenticated and pdf.js
          // does not send credentials unless told to.
          withCredentials: true,
        });
        task = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        setPdf(doc);
        setPageCount(doc.numPages);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      // Release the worker and its parsed page cache; without this, opening
      // several documents in a session leaks a worker each time.
      void task?.destroy();
    };
  }, [fileUrl]);

  // Fit to the container on first render, so a letter page is readable
  // without reaching for the zoom control.
  const frameRef = useRef<HTMLDivElement | null>(null);
  const didFit = useRef(false);
  const onPageRendered = useCallback(
    ({ width }: { width: number; height: number }) => {
      if (didFit.current || !frameRef.current) return;
      const available = frameRef.current.clientWidth - 32;
      if (available <= 0 || width <= 0) return;
      didFit.current = true;
      const ideal = available / (width / scale);
      // Snap to the zoom steps rather than an arbitrary fraction, so the
      // displayed percentage matches the control.
      const nearest = ZOOMS.reduce((best, z) =>
        Math.abs(z - ideal) < Math.abs(best - ideal) ? z : best,
      );
      if (nearest !== scale) setScale(nearest);
    },
    [scale],
  );

  const pageAnnotations = useMemo(
    () => annotations.filter((a) => a.pageNumber === pageNumber),
    [annotations, pageNumber],
  );

  // ---- markup writes ---------------------------------------------------

  const create = (draft: Omit<MarkupAnnotation, "id">) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic: MarkupAnnotation = { ...draft, id };
    setAnnotations((prev) => [...prev, optimistic]);
    setError(null);

    startBusy(async () => {
      const result = await saveAnnotation({
        id,
        documentId,
        pageNumber: optimistic.pageNumber,
        kind: optimistic.kind,
        x: optimistic.x,
        y: optimistic.y,
        w: optimistic.w,
        h: optimistic.h,
        points: optimistic.points,
        body: optimistic.body,
        color: optimistic.color,
        fontSize: optimistic.fontSize,
        strokeWidth: optimistic.strokeWidth,
        opacity: optimistic.opacity,
        imageData: optimistic.imageData,
      });
      if (!result.ok) {
        // Remove exactly the mark that failed, leaving everything else.
        setAnnotations((prev) => prev.filter((a) => a.id !== id));
        setError(result.error);
      }
    });
  };

  const updateBody = (id: string, body: string) => {
    const target = annotations.find((a) => a.id === id);
    if (!target) return;

    // An empty text box is nothing at all — discard rather than leaving an
    // invisible mark that has to be hunted down later.
    if (target.kind === "text" && body.trim() === "") {
      remove(id);
      return;
    }

    const previous = target.body;
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, body } : a)),
    );
    setError(null);
    startBusy(async () => {
      const result = await saveAnnotation({
        ...target,
        body,
        documentId,
      });
      if (!result.ok) {
        setAnnotations((prev) =>
          prev.map((a) => (a.id === id ? { ...a, body: previous } : a)),
        );
        setError(result.error);
      }
    });
  };

  const remove = (id: string) => {
    const previous = annotations;
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
    setError(null);
    startBusy(async () => {
      const result = await deleteAnnotation(id);
      if (!result.ok) {
        setAnnotations(previous);
        setError(result.error);
      }
    });
  };

  const clearPage = () => {
    if (pageAnnotations.length === 0) return;
    if (
      !window.confirm(
        `Remove all ${pageAnnotations.length} mark${pageAnnotations.length === 1 ? "" : "s"} from page ${pageNumber}?`,
      )
    )
      return;
    const previous = annotations;
    setAnnotations((prev) => prev.filter((a) => a.pageNumber !== pageNumber));
    setSelectedId(null);
    startBusy(async () => {
      const result = await clearAnnotations(documentId, pageNumber);
      if (!result.ok) {
        setAnnotations(previous);
        setError(result.error);
      }
    });
  };

  // Delete/Backspace removes the selected mark, as in every editor. Skipped
  // while a text box has focus, where those keys mean "edit the text".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "TEXTAREA" ||
          el.tagName === "INPUT" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, annotations]);

  // ---- exports and page operations -------------------------------------

  const goToNewVersion = (id: string, message: string) => {
    setNotice(message);
    router.push(`/business-builder/documents/${engagementId}/markup/${id}`);
    router.refresh();
  };

  const onExport = () => {
    setError(null);
    setNotice(null);
    startBusy(async () => {
      const result = await exportMarkedUpPdf(documentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const skipped =
        result.data.skipped > 0
          ? ` ${result.data.skipped} mark(s) referenced pages that no longer exist and were left out.`
          : "";
      goToNewVersion(
        result.data.id,
        `Saved as version ${result.data.version}: ${result.data.filename}.${skipped}`,
      );
    });
  };

  const runPageOp = (
    op: Parameters<typeof applyPdfPageOps>[1][number],
    confirmMessage?: string,
  ) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    setNotice(null);
    startBusy(async () => {
      const result = await applyPdfPageOps(documentId, [op]);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      goToNewVersion(
        result.data.id,
        `Saved as version ${result.data.version}: ${result.data.filename} (${result.data.pageCount} page${result.data.pageCount === 1 ? "" : "s"}).`,
      );
    });
  };

  const markupCount = annotations.length;

  if (loadError) {
    return (
      <div className="border border-tbb-line rounded-md bg-white p-6">
        <p className="font-sans text-sm text-tbb-orange">
          This PDF couldn&apos;t be opened. {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="border border-tbb-line rounded-md bg-white p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {TOOLS.map(({ tool: t, label, Icon }) => {
            const disabled = t === "image" && !stampImage;
            const active = tool === t;
            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setTool(t);
                  setSelectedId(null);
                }}
                title={
                  disabled
                    ? "Add a signature at Settings → Signature to use this"
                    : label
                }
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-sans text-xs ${
                  active
                    ? "bg-tbb-blue text-white border-tbb-blue"
                    : "bg-white text-foreground border-tbb-line hover:border-tbb-blue"
                } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-tbb-line">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
              Colour
            </span>
            {MARKUP_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                aria-label={c.label}
                aria-pressed={color === c.hex}
                onClick={() => setColor(c.hex)}
                className={`h-5 w-5 rounded-full border-2 ${
                  color === c.hex ? "border-tbb-ink" : "border-tbb-line"
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>

          {tool === "text" && (
            <label className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
              Size
              <input
                type="number"
                min={6}
                max={72}
                value={fontSize}
                onChange={(e) =>
                  setFontSize(
                    Math.max(6, Math.min(72, Number(e.target.value) || 12)),
                  )
                }
                className="w-16 border border-tbb-line rounded px-1.5 py-0.5 font-sans text-sm text-foreground"
              />
            </label>
          )}

          {(tool === "ink" || tool === "box" || tool === "strikeout") && (
            <label className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
              Thickness
              <input
                type="number"
                min={1}
                max={20}
                step={0.5}
                value={strokeWidth}
                onChange={(e) =>
                  setStrokeWidth(
                    Math.max(1, Math.min(20, Number(e.target.value) || 2)),
                  )
                }
                className="w-16 border border-tbb-line rounded px-1.5 py-0.5 font-sans text-sm text-foreground"
              />
            </label>
          )}

          <label className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Zoom
            <select
              value={scale}
              onChange={(e) => {
                didFit.current = true;
                setScale(Number(e.target.value));
              }}
              className="border border-tbb-line rounded px-1.5 py-0.5 font-sans text-sm text-foreground"
            >
              {ZOOMS.map((z) => (
                <option key={z} value={z}>
                  {Math.round(z * 100)}%
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={clearPage}
              disabled={busy || pageAnnotations.length === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-tbb-line bg-white font-sans text-xs text-foreground hover:border-tbb-orange disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Clear page
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={busy || markupCount === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-tbb-ink text-white font-sans text-xs font-bold hover:bg-tbb-blue disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden />
              )}
              Save marked-up copy
            </button>
          </div>
        </div>

        <p className="font-sans text-xs text-muted-foreground">
          {tool === "select"
            ? "Click a mark to select it, double-click text to edit, Delete to remove."
            : tool === "text"
              ? "Click where the text should start, then type."
              : tool === "ink"
                ? "Drag to draw. Works with a stylus."
                : tool === "image"
                  ? "Drag a box where your signature should sit."
                  : "Drag across the area you want to mark."}
          {markupCount > 0 && (
            <>
              {" "}
              <span className="font-mono text-[11px] uppercase tracking-tbb-caps">
                {markupCount} mark{markupCount === 1 ? "" : "s"} saved
              </span>
            </>
          )}
        </p>
      </div>

      {notice && (
        <p className="font-sans text-sm text-tbb-blue border border-tbb-line rounded-md bg-white p-3">
          {notice}
        </p>
      )}
      {error && (
        <p className="font-sans text-sm text-tbb-orange border border-tbb-orange/40 rounded-md bg-white p-3">
          {error}
        </p>
      )}

      {/* Page navigation */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          disabled={pageNumber <= 1}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-tbb-line bg-white font-sans text-xs disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Previous
        </button>
        <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Page {pageNumber} of {pageCount || "…"}
        </span>
        <button
          type="button"
          onClick={() =>
            setPageNumber((p) => Math.min(pageCount || p, p + 1))
          }
          disabled={pageCount === 0 || pageNumber >= pageCount}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-tbb-line bg-white font-sans text-xs disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {/* The page */}
      <div
        ref={frameRef}
        className="overflow-auto bg-tbb-cream border border-tbb-line rounded-md p-4"
      >
        {pdf ? (
          <PdfPageSurface
            pdf={pdf}
            pageNumber={pageNumber}
            scale={scale}
            tool={tool}
            color={color}
            fontSize={fontSize}
            strokeWidth={strokeWidth}
            stampImage={stampImage}
            annotations={pageAnnotations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={create}
            onUpdateBody={updateBody}
            onDelete={remove}
            onPageRendered={onPageRendered}
          />
        ) : (
          <div className="grid place-items-center h-64">
            <Loader2
              className="h-6 w-6 animate-spin text-muted-foreground"
              aria-hidden
            />
          </div>
        )}
      </div>

      <PageOperations
        pageNumber={pageNumber}
        pageCount={pageCount}
        markupCount={markupCount}
        busy={busy}
        onRun={runPageOp}
        filename={filename}
      />
    </div>
  );
}

/**
 * Page operations — the "edit the PDF" half.
 *
 * Each one writes a new version, so the panel states that plainly rather than
 * pretending to change the file in place. Anything destructive confirms first,
 * naming the pages, because a wrong page deletion found by a client is far
 * more expensive than a second click.
 */
function PageOperations({
  pageNumber,
  pageCount,
  markupCount,
  busy,
  onRun,
  filename,
}: {
  pageNumber: number;
  pageCount: number;
  markupCount: number;
  busy: boolean;
  onRun: (
    op: Parameters<typeof applyPdfPageOps>[1][number],
    confirmMessage?: string,
  ) => void;
  filename: string;
}) {
  const [range, setRange] = useState("");
  const [order, setOrder] = useState("");

  const parsedRange = useMemo(
    () => (pageCount > 0 ? parsePageRange(range, pageCount) : []),
    [range, pageCount],
  );

  const parsedOrder = useMemo(
    () =>
      order
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= pageCount),
    [order, pageCount],
  );

  return (
    <div className="border border-tbb-line rounded-md bg-white p-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-foreground">Edit pages</h2>
        <p className="font-sans text-xs text-muted-foreground mt-1">
          Each change is saved as a new version of {filename} — the current file
          is never overwritten.
          {markupCount > 0 && (
            <>
              {" "}
              Your {markupCount} mark{markupCount === 1 ? "" : "s"} will be
              baked into the new version first, so nothing shifts onto the wrong
              page.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || pageCount === 0}
          onClick={() => onRun({ type: "rotate", pages: [pageNumber], turn: 90 })}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-tbb-line bg-white font-sans text-xs hover:border-tbb-blue disabled:opacity-40"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          Rotate page {pageNumber}
        </button>
        <button
          type="button"
          disabled={busy || pageCount <= 1}
          onClick={() =>
            onRun(
              { type: "delete", pages: [pageNumber] },
              `Delete page ${pageNumber} of ${pageCount}? This saves a new version without that page.`,
            )
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-tbb-line bg-white font-sans text-xs hover:border-tbb-orange disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete page {pageNumber}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Pages — e.g. 1, 3-5, 8-last
          </label>
          <input
            type="text"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            placeholder="3-5"
            className="w-full border border-tbb-line rounded px-2 py-1.5 font-sans text-sm"
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy || parsedRange.length === 0}
              onClick={() =>
                onRun(
                  { type: "extract", pages: parsedRange },
                  `Save pages ${parsedRange.join(", ")} as a new document?`,
                )
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-tbb-line bg-white font-sans text-xs hover:border-tbb-blue disabled:opacity-40"
            >
              <Scissors className="h-3.5 w-3.5" aria-hidden />
              Keep only these
            </button>
            <button
              type="button"
              disabled={
                busy ||
                parsedRange.length === 0 ||
                parsedRange.length >= pageCount
              }
              onClick={() =>
                onRun(
                  { type: "delete", pages: parsedRange },
                  `Delete page${parsedRange.length === 1 ? "" : "s"} ${parsedRange.join(", ")}?`,
                )
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-tbb-line bg-white font-sans text-xs hover:border-tbb-orange disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete these
            </button>
          </div>
          {range.trim() !== "" && parsedRange.length === 0 && (
            <p className="font-sans text-xs text-tbb-orange">
              That doesn&apos;t match any pages in this document.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            New page order — every page, once
          </label>
          <input
            type="text"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            placeholder={
              pageCount > 0
                ? Array.from({ length: Math.min(pageCount, 4) }, (_, i) =>
                    String(i + 1),
                  ).join(", ") + (pageCount > 4 ? ", …" : "")
                : "2, 1, 3"
            }
            className="w-full border border-tbb-line rounded px-2 py-1.5 font-sans text-sm"
          />
          <button
            type="button"
            disabled={busy || parsedOrder.length !== pageCount || pageCount === 0}
            onClick={() => onRun({ type: "reorder", order: parsedOrder })}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-tbb-line bg-white font-sans text-xs hover:border-tbb-blue disabled:opacity-40"
          >
            Reorder pages
          </button>
          {order.trim() !== "" && parsedOrder.length !== pageCount && (
            <p className="font-sans text-xs text-muted-foreground">
              List all {pageCount} pages exactly once. Currently{" "}
              {parsedOrder.length}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
