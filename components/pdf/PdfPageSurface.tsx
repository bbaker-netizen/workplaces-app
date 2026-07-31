"use client";

/**
 * One rendered page, plus the markup layer over it.
 *
 * Two jobs, deliberately kept in one component because they share a single
 * piece of state that must never disagree: the page's `viewport`.
 *
 *   1. Draw the page to a canvas via pdf.js.
 *   2. Capture pointer input as markup, and draw existing markup back.
 *
 * EVERY COORDINATE CONVERSION GOES THROUGH THE VIEWPORT, never through
 * arithmetic on the canvas size. `viewport.convertToPdfPoint()` and its
 * inverse already account for the zoom level AND the page's /Rotate, so a
 * markup captured on a rotated page at 150% lands correctly when the same
 * page is re-rendered at another zoom, and the server needs no rotation maths
 * to place it. Doing this by hand with width/height ratios is the bug that
 * puts markup half an inch off on exactly the documents that matter.
 *
 * Note on rotated pages: pdf.js renders them upright (that is what /Rotate is
 * for), so text typed here appears upright, and the burn step orients its text
 * to match. The editor and the export agree without special-casing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";
import { Trash2 } from "lucide-react";
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_STROKE_WIDTH,
  clamp01,
  defaultOpacityFor,
  matchStandardFont,
  type MarkupFont,
  type AnnotationKind,
  type MarkupAnnotation,
  type NormalizedPoint,
} from "@/lib/pdf/annotations";

export type Tool = AnnotationKind | "select" | "edit";

type DraftRect = { x0: number; y0: number; x1: number; y1: number };

/**
 * A run of existing text on the page, located in normalized PDF user space.
 *
 * This is what makes "edit the words that are already there" possible without
 * touching the content stream: pdf.js hands back every text run with its
 * string, its transform, and its width, all in UNSCALED user space — the same
 * space this component already stores marks in. So a run converts straight to
 * a normalized rect with no viewport maths, and clicking one can cover it and
 * retype it in exactly the right spot.
 */
type TextRun = {
  key: string;
  str: string;
  /** Font size in PDF points, recovered from the run's transform. */
  size: number;
  /** Closest standard font to the one the page actually uses. */
  font: MarkupFont;
  /** Normalized rect, bottom-left origin, same contract as MarkupAnnotation. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export function PdfPageSurface({
  pdf,
  pageNumber,
  scale,
  tool,
  color,
  fontSize,
  strokeWidth,
  stampImage,
  annotations,
  selectedId,
  onSelect,
  onCreate,
  onUpdateBody,
  onDelete,
  onGeometry,
  onPageRendered,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  tool: Tool;
  color: string;
  fontSize: number;
  strokeWidth: number;
  stampImage: string | null;
  annotations: MarkupAnnotation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Returns the id of the created mark, so the caller can open it to edit. */
  onCreate: (a: Omit<MarkupAnnotation, "id">) => string;
  onUpdateBody: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  /**
   * Live geometry during a drag, then a commit. `rect` is null on the commit
   * call — the parent already holds the last live value.
   */
  onGeometry?: (
    id: string,
    rect: { x: number; y: number; w: number; h: number } | null,
    commit: boolean,
  ) => void;
  onPageRendered?: (info: { width: number; height: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [draft, setDraft] = useState<DraftRect | null>(null);
  const [inkPath, setInkPath] = useState<NormalizedPoint[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [renderError, setRenderError] = useState<string | null>(null);

  // ---- render the page -------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    // pdf.js throws if two render tasks share a canvas, which is exactly what
    // a fast page-flip or zoom change causes. The previous task is cancelled
    // rather than awaited.
    let task: { cancel: () => void } | null = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Render at device resolution, present at CSS resolution, so the
        // overlay's pixel space equals the viewport's and one conversion
        // serves both.
        const dpr = Math.min(
          typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
          3,
        );
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;

        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);

        // pdf.js v6 takes the canvas itself; `canvasContext` is the legacy
        // path and passing both is explicitly unsupported.
        const renderTask = page.render({
          canvas,
          viewport: vp,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        task = renderTask;
        await renderTask.promise;
        if (cancelled) return;
        setViewport(vp);
        setRenderError(null);
        onPageRendered?.({ width: vp.width, height: vp.height });
      } catch (e) {
        // A cancelled render is the normal path when flipping pages fast.
        const name = (e as { name?: string })?.name;
        if (cancelled || name === "RenderingCancelledException") return;
        setRenderError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      try {
        task?.cancel();
      } catch {
        // Cancelling an already-settled task is not an error worth surfacing.
      }
    };
    // onPageRendered is intentionally excluded: it is a notification, and
    // including it would re-render the page whenever the parent re-created it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNumber, scale]);

  // ---- coordinate conversion ------------------------------------------

  // Memoized because both converters below depend on it, and a fresh object
  // each render would make them new functions each render — which re-renders
  // every mark on the page on every pointer move during a drag.
  const box = useMemo(
    () =>
      viewport
        ? {
            x: viewport.viewBox[0],
            y: viewport.viewBox[1],
            w: viewport.viewBox[2] - viewport.viewBox[0],
            h: viewport.viewBox[3] - viewport.viewBox[1],
          }
        : null,
    [viewport],
  );

  /** Overlay pixel point to normalized PDF user space. */
  const toNorm = useCallback(
    (px: number, py: number): NormalizedPoint => {
      if (!viewport || !box || box.w <= 0 || box.h <= 0) return { x: 0, y: 0 };
      const [ux, uy] = viewport.convertToPdfPoint(px, py);
      return {
        x: clamp01((ux - box.x) / box.w),
        y: clamp01((uy - box.y) / box.h),
      };
    },
    [viewport, box],
  );

  /** Normalized PDF user space to overlay pixel point. */
  const toPx = useCallback(
    (nx: number, ny: number): { x: number; y: number } => {
      if (!viewport || !box) return { x: 0, y: 0 };
      const [vx, vy] = viewport.convertToViewportPoint(
        box.x + nx * box.w,
        box.y + ny * box.h,
      );
      return { x: vx, y: vy };
    },
    [viewport, box],
  );

  /** Normalized rect to an overlay CSS box, orientation-safe. */
  const rectToCss = useCallback(
    (a: Pick<MarkupAnnotation, "x" | "y" | "w" | "h">) => {
      const p1 = toPx(a.x, a.y);
      const p2 = toPx(a.x + a.w, a.y + a.h);
      return {
        left: Math.min(p1.x, p2.x),
        top: Math.min(p1.y, p2.y),
        width: Math.abs(p2.x - p1.x),
        height: Math.abs(p2.y - p1.y),
      };
    },
    [toPx],
  );

  // ---- existing text, for the Edit text tool ---------------------------

  const [textRuns, setTextRuns] = useState<TextRun[] | null>(null);
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetched when the tool is actually in use — parsing text content is
    // wasted work for someone who only wants to highlight.
    if (tool !== "edit" || !box) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        if (cancelled) return;
        // Fragments first, then merged into lines below.
        type Frag = {
          str: string;
          size: number;
          font: MarkupFont;
          x0: number;
          x1: number;
          baseline: number;
        };
        const frags: Frag[] = [];
        content.items.forEach((raw) => {
          const item = raw as {
            str?: string;
            width?: number;
            transform?: number[];
            fontName?: string;
          };
          const str = item.str ?? "";
          const t = item.transform;
          if (!str.trim() || !t || t.length < 6) return;

          // Vertical scale of the text matrix is the rendered font size.
          const size = Math.hypot(t[1], t[3]) || Math.abs(t[3]) || 0;
          if (size <= 0) return;
          const width = item.width ?? 0;
          if (width <= 0) return;

          const style = item.fontName
            ? (content.styles as Record<string, { fontFamily?: string }>)?.[
                item.fontName
              ]
            : undefined;

          frags.push({
            str,
            size,
            font: matchStandardFont(style?.fontFamily, item.fontName),
            x0: t[4],
            x1: t[4] + width,
            // t[5] is the BASELINE, which is what lines are grouped on.
            baseline: t[5],
          });
        });

        // Merge fragments into lines. A PDF splits one visual line into
        // several runs whenever the font, size or kerning changes, so
        // clicking "Peter Williams — Site Supervisor" could otherwise be
        // three separate edits. Anything sharing a baseline is one line, which
        // is the unit Acrobat edits too.
        frags.sort((a, b) => b.baseline - a.baseline || a.x0 - b.x0);
        const lines: Frag[][] = [];
        for (const f of frags) {
          const line = lines[lines.length - 1];
          const prev = line?.[line.length - 1];
          // Tolerance scales with the type size: a 6pt footnote and a 24pt
          // heading do not share a sensible fixed threshold.
          if (prev && Math.abs(prev.baseline - f.baseline) <= f.size * 0.3) {
            line.push(f);
          } else {
            lines.push([f]);
          }
        }

        const runs: TextRun[] = lines.map((line, i) => {
          const size = Math.max(...line.map((f) => f.size));
          const x0 = Math.min(...line.map((f) => f.x0));
          const x1 = Math.max(...line.map((f) => f.x1));
          const baseline = line[0].baseline;
          // Re-insert the spaces the PDF implied through positioning rather
          // than through space characters.
          let str = "";
          line.forEach((f, j) => {
            const prev = line[j - 1];
            if (prev && f.x0 - prev.x1 > f.size * 0.18 && !/\s$/.test(str)) {
              str += " ";
            }
            str += f.str;
          });
          return {
            key: `${pageNumber}:${i}`,
            str,
            size,
            font: line[0].font,
            x: clamp01((x0 - box.x) / box.w),
            // Pad below the baseline for descenders, or the white-out clips
            // the tails of g, y and p.
            y: clamp01((baseline - size * 0.25 - box.y) / box.h),
            w: (x1 - x0) / box.w,
            h: (size * 1.2) / box.h,
          };
        });
        setTextRuns(runs);
        setTextError(
          runs.length === 0
            ? "No selectable text on this page — it's probably a scan. Use White out and Text instead."
            : null,
        );
      } catch (e) {
        if (!cancelled) {
          setTextError(e instanceof Error ? e.message : String(e));
          setTextRuns([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, tool, box]);

  /**
   * Replace a run of existing text.
   *
   * Two marks, in this order: an opaque white rectangle over the old words,
   * then a text box pre-filled with them. Creation order is paint order, so
   * the cover always sits under the replacement. This is cover-and-retype
   * automated — it is what "editing" a line in a PDF amounts to, and it is
   * why the paragraph does not reflow.
   */
  const replaceRun = (run: TextRun) => {
    const pad = 0.002;
    onCreate({
      pageNumber,
      kind: "whiteout",
      x: clamp01(run.x - pad),
      y: clamp01(run.y - pad),
      w: run.w + pad * 2,
      h: run.h + pad * 2,
      points: null,
      body: null,
      color: "#FFFFFF",
      fontSize: null,
      font: null,
      strokeWidth: null,
      opacity: 1,
      imageData: null,
    });
    const id = onCreate({
      pageNumber,
      kind: "text",
      x: run.x,
      y: run.y,
      // Give the replacement room to run a little longer than the original,
      // since retyped text is usually not the same length.
      w: Math.min(run.w * 1.6 + 0.02, 1 - run.x),
      h: run.h,
      points: null,
      body: run.str,
      color,
      fontSize: Math.round(run.size * 10) / 10,
      font: run.font,
      strokeWidth: null,
      opacity: 1,
      imageData: null,
    });
    setEditingId(id);
    setTextDraft(run.str);
  };

  // ---- move and resize -------------------------------------------------

  /**
   * Dragging a placed mark.
   *
   * Deltas are taken in NORMALIZED space, not pixels: converting both the
   * start and the current point through `toNorm` and subtracting means a drag
   * behaves correctly at any zoom and on a rotated page, where screen x is not
   * page x. Live updates are local-only; the move is persisted once on release
   * so a drag is one database write rather than one per frame.
   */
  const [drag, setDrag] = useState<{
    id: string;
    mode: "move" | "resize";
    from: NormalizedPoint;
    orig: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const beginDrag = (
    a: MarkupAnnotation,
    mode: "move" | "resize",
    e: React.PointerEvent,
  ) => {
    const p = localPoint(e);
    setDrag({
      id: a.id,
      mode,
      from: toNorm(p.x, p.y),
      orig: { x: a.x, y: a.y, w: a.w, h: a.h },
    });
    onSelect(a.id);
  };

  // ---- capture ---------------------------------------------------------

  const overlayRef = useRef<HTMLDivElement | null>(null);

  const localPoint = (e: React.PointerEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!viewport || editingId) return;
    if (tool === "select" || tool === "edit") {
      // Neither tool draws. Clicks on an existing mark are handled by the mark
      // itself and clicks on a text run by its hotspot; a click on bare page
      // just clears the selection.
      onSelect(null);
      return;
    }
    if (tool === "image" && !stampImage) return;

    const p = localPoint(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "ink") {
      const n = toNorm(p.x, p.y);
      setInkPath([n]);
      return;
    }
    if (tool === "text") {
      createTextAt(p.x, p.y);
      return;
    }
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!viewport) return;
    if (drag) {
      const p = localPoint(e);
      const now = toNorm(p.x, p.y);
      const dx = now.x - drag.from.x;
      const dy = now.y - drag.from.y;
      const next =
        drag.mode === "move"
          ? {
              x: clamp01(drag.orig.x + dx),
              y: clamp01(drag.orig.y + dy),
              w: drag.orig.w,
              h: drag.orig.h,
            }
          : {
              x: drag.orig.x,
              y: drag.orig.y,
              // A mark dragged smaller than a hair is unclickable and
              // invisible; floor it rather than let it vanish.
              w: Math.max(0.004, drag.orig.w + dx),
              h: Math.max(0.004, drag.orig.h + dy),
            };
      onGeometry?.(drag.id, next, false);
      return;
    }
    if (inkPath) {
      const p = localPoint(e);
      setInkPath((prev) =>
        prev ? [...prev, toNorm(p.x, p.y)] : prev,
      );
      return;
    }
    if (draft) {
      const p = localPoint(e);
      setDraft((prev) => (prev ? { ...prev, x1: p.x, y1: p.y } : prev));
    }
  };

  const onPointerUp = () => {
    if (!viewport) return;

    if (drag) {
      const finished = drag;
      setDrag(null);
      // Commit whatever the last live position was — the parent already holds
      // it, so this only tells it to persist.
      onGeometry?.(finished.id, null, true);
      return;
    }

    if (inkPath) {
      const path = inkPath;
      setInkPath(null);
      // A tap rather than a drag leaves a single point, which draws nothing.
      if (path.length < 2) return;
      const xs = path.map((p) => p.x);
      const ys = path.map((p) => p.y);
      onCreate({
        pageNumber,
        kind: "ink",
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
        points: path,
        body: null,
        color,
        fontSize: null,
        font: null,
        strokeWidth,
        opacity: 1,
        imageData: null,
      });
      return;
    }

    if (draft) {
      const d = draft;
      setDraft(null);
      // Ignore an accidental click-without-drag; a zero-area mark is
      // invisible and would just accumulate.
      if (Math.abs(d.x1 - d.x0) < 4 || Math.abs(d.y1 - d.y0) < 4) return;
      const a = toNorm(d.x0, d.y0);
      const b = toNorm(d.x1, d.y1);
      const kind = tool as AnnotationKind;
      onCreate({
        pageNumber,
        kind,
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x),
        h: Math.abs(b.y - a.y),
        points: null,
        body: null,
        color,
        fontSize: null,
        font: null,
        strokeWidth,
        opacity: defaultOpacityFor(kind),
        imageData: kind === "image" ? stampImage : null,
      });
    }
  };

  /**
   * Text boxes are created by clicking, not dragging — the click is the
   * top-left corner and the box is sized to hold a few lines, which is what
   * every PDF tool does and what a person expects from "click here and type".
   */
  const createTextAt = (px: number, py: number) => {
    if (!box) return;
    const top = toNorm(px, py);
    const lineHeight = (fontSize * 1.2) / box.h;
    const h = Math.min(lineHeight * 3, 0.9);
    const w = 0.45;
    onCreate({
      pageNumber,
      kind: "text",
      x: Math.min(top.x, 1 - Math.min(w, 1)),
      // The click is the TOP of the box; stored y is the bottom edge.
      y: clamp01(top.y - h),
      w,
      h,
      points: null,
      body: "",
      color,
      fontSize,
      font: null,
      strokeWidth: null,
      opacity: 1,
      imageData: null,
    });
  };

  const startEditing = (a: MarkupAnnotation) => {
    setEditingId(a.id);
    setTextDraft(a.body ?? "");
  };

  const commitEditing = () => {
    if (!editingId) return;
    onUpdateBody(editingId, textDraft);
    setEditingId(null);
    setTextDraft("");
  };

  // Leaving the page mid-edit must clear the editing state. The open textarea
  // belongs to a mark on the page being left, so it stops rendering — but
  // `editingId` would stay set, and pointer input is suppressed while editing,
  // which leaves every tool dead on the next page until a reload.
  useEffect(() => {
    setEditingId(null);
    setTextDraft("");
    setDraft(null);
    setInkPath(null);
  }, [pageNumber]);

  // A newly created empty text box should open for typing immediately.
  useEffect(() => {
    const fresh = annotations.find(
      (a) => a.kind === "text" && (a.body ?? "") === "",
    );
    if (fresh && !editingId) {
      setEditingId(fresh.id);
      setTextDraft("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations.length]);

  // The selected mark and its on-screen box, for the floating delete button.
  const selectedTarget = (() => {
    if (!selectedId || !viewport || editingId) return null;
    const a = annotations.find((x) => x.id === selectedId);
    if (!a) return null;
    return { a, css: rectToCss(a) };
  })();

  const cursor =
    tool === "select" || tool === "edit"
      ? "default"
      : tool === "text"
        ? "text"
        : tool === "image" && !stampImage
          ? "not-allowed"
          : "crosshair";

  return (
    <div className="relative inline-block bg-white shadow-sm border border-tbb-line">
      <canvas ref={canvasRef} className="block" />

      {renderError && (
        <div className="absolute inset-0 grid place-items-center bg-white/90 p-6">
          <p className="font-sans text-sm text-tbb-orange text-center">
            This page couldn&apos;t be rendered. {renderError}
          </p>
        </div>
      )}

      {viewport && (
        <div
          ref={overlayRef}
          className="absolute inset-0 touch-none"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {annotations.map((a) => (
            <AnnotationView
              key={a.id}
              a={a}
              css={rectToCss(a)}
              toPx={toPx}
              scale={scale}
              selected={selectedId === a.id}
              editing={editingId === a.id}
              textDraft={textDraft}
              selectable={tool === "select"}
              onSelect={() => onSelect(a.id)}
              onBeginDrag={(mode, e) => beginDrag(a, mode, e)}
              onStartEditing={() => startEditing(a)}
              onChangeDraft={setTextDraft}
              onCommit={commitEditing}
            />
          ))}

          {/* In-progress marks, drawn locally so the drag feels immediate. */}
          {draft && (
            <div
              className="absolute border border-dashed pointer-events-none"
              style={{
                left: Math.min(draft.x0, draft.x1),
                top: Math.min(draft.y0, draft.y1),
                width: Math.abs(draft.x1 - draft.x0),
                height: Math.abs(draft.y1 - draft.y0),
                borderColor: color,
                backgroundColor:
                  tool === "highlight"
                    ? `${color}66`
                    : tool === "whiteout"
                      ? "#ffffff"
                      : "transparent",
              }}
            />
          )}
          {tool === "edit" && textError && (
            <div className="absolute left-2 top-2 right-2 z-20 rounded border border-tbb-orange/50 bg-white/95 px-3 py-2 font-sans text-xs text-foreground shadow-sm">
              {textError}
            </div>
          )}

          {/*
            Hotspots over every run of existing text, for the Edit text tool.
            Rendered from stored-space rects through the same `rectToCss` the
            marks use, so they line up on rotated pages for free.
          */}
          {tool === "edit" &&
            textRuns?.map((run) => {
              const css = rectToCss(run);
              if (css.width < 2 || css.height < 2) return null;
              return (
                <button
                  key={run.key}
                  type="button"
                  title={`Replace “${run.str.slice(0, 60)}”`}
                  className="absolute cursor-text rounded-[2px] border border-dashed border-transparent hover:border-tbb-blue hover:bg-tbb-blue/10"
                  style={{
                    left: css.left,
                    top: css.top,
                    width: css.width,
                    height: css.height,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    replaceRun(run);
                  }}
                />
              );
            })}

          {/*
            One delete button for whatever is selected, floated at the mark's
            top-right corner. Rendered here rather than inside each mark
            because ink marks are <svg> and the others are <div> — a shared
            child would have to be valid inside both, which is what made the
            first attempt at this unworkable.
          */}
          {selectedTarget && (
            <button
              type="button"
              aria-label="Delete this markup"
              className="absolute z-10 grid place-items-center h-7 w-7 rounded-full bg-tbb-ink text-white shadow hover:bg-tbb-orange"
              style={{
                left: selectedTarget.css.left + selectedTarget.css.width - 10,
                top: selectedTarget.css.top - 10,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(selectedTarget.a.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}

          {/*
            Resize handle, bottom-right of the selection. Ink is excluded: its
            shape is a path, and scaling the bounding box would not scale the
            stroke with it.
          */}
          {selectedTarget && selectedTarget.a.kind !== "ink" && (
            <div
              role="presentation"
              title="Drag to resize"
              className="absolute z-10 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-tbb-blue shadow"
              style={{
                left: selectedTarget.css.left + selectedTarget.css.width - 6,
                top: selectedTarget.css.top + selectedTarget.css.height - 6,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                beginDrag(selectedTarget.a, "resize", e);
              }}
            />
          )}

          {inkPath && inkPath.length > 1 && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={viewport.width}
              height={viewport.height}
            >
              <polyline
                points={inkPath
                  .map((p) => {
                    const q = toPx(p.x, p.y);
                    return `${q.x},${q.y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth * scale}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

function AnnotationView({
  a,
  css,
  toPx,
  scale,
  selected,
  editing,
  textDraft,
  selectable,
  onSelect,
  onBeginDrag,
  onStartEditing,
  onChangeDraft,
  onCommit,
}: {
  a: MarkupAnnotation;
  css: { left: number; top: number; width: number; height: number };
  toPx: (nx: number, ny: number) => { x: number; y: number };
  scale: number;
  selected: boolean;
  editing: boolean;
  textDraft: string;
  selectable: boolean;
  onSelect: () => void;
  onBeginDrag: (mode: "move" | "resize", e: React.PointerEvent) => void;
  onStartEditing: () => void;
  onChangeDraft: (v: string) => void;
  onCommit: () => void;
}) {
  const opacity = a.opacity ?? 1;
  const stroke = (a.strokeWidth ?? DEFAULT_STROKE_WIDTH) * scale;

  // Only the select tool makes marks clickable; otherwise a mark sitting under
  // the cursor would swallow the drag that is trying to draw over it.
  const interactive = selectable || editing;
  const base: React.CSSProperties = {
    position: "absolute",
    left: css.left,
    top: css.top,
    width: css.width,
    height: css.height,
    pointerEvents: interactive ? "auto" : "none",
  };

  const ring = selected
    ? { outline: "2px solid #2E4057", outlineOffset: 2 }
    : undefined;

  if (a.kind === "ink") {
    const pts = a.points ?? [];
    return (
      <svg
        style={{ ...base, ...ring, overflow: "visible" }}
        onPointerDown={(e) => {
          if (!selectable) return;
          e.stopPropagation();
          onSelect();
          onBeginDrag("move", e);
        }}
      >
        <polyline
          points={pts
            .map((p) => {
              const q = toPx(p.x, p.y);
              return `${q.x - css.left},${q.y - css.top}`;
            })
            .join(" ")}
          fill="none"
          stroke={a.color}
          strokeWidth={stroke}
          strokeOpacity={opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (a.kind === "text") {
    const size = (a.fontSize ?? DEFAULT_FONT_SIZE) * scale;
    if (editing) {
      return (
        <textarea
          autoFocus
          value={textDraft}
          onChange={(e) => onChangeDraft(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Escape" || (e.key === "Enter" && e.metaKey)) {
              e.preventDefault();
              onCommit();
            }
            // Typing must not reach the page beneath.
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            ...base,
            fontSize: size,
            lineHeight: 1.2,
            color: a.color,
            fontFamily: "Helvetica, Arial, sans-serif",
            border: "1px dashed #2E4057",
            background: "rgba(255,255,255,0.85)",
            padding: 0,
            resize: "none",
            outline: "none",
          }}
        />
      );
    }
    return (
      <div
        style={{
          ...base,
          ...ring,
          fontSize: size,
          lineHeight: 1.2,
          color: a.color,
          opacity,
          fontFamily: "Helvetica, Arial, sans-serif",
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          cursor: selectable ? "pointer" : "default",
        }}
        onPointerDown={(e) => {
          if (!selectable) return;
          e.stopPropagation();
          onSelect();
          onBeginDrag("move", e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onStartEditing();
        }}
        title={selectable ? "Double-click to edit" : undefined}
      >
        {a.body}
      </div>
    );
  }

  if (a.kind === "image") {
    return (
      <div
        style={{ ...base, ...ring }}
        onPointerDown={(e) => {
          if (!selectable) return;
          e.stopPropagation();
          onSelect();
          onBeginDrag("move", e);
        }}
      >
        {a.imageData && (
          // A stored signature stamp. Plain img: the data URL is already in
          // memory and next/image would add nothing but constraints.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.imageData}
            alt="Stamp"
            style={{ width: "100%", height: "100%", opacity }}
          />
        )}
      </div>
    );
  }

  // highlight / whiteout / box / strikeout
  const style: React.CSSProperties = { ...base, ...ring };
  if (a.kind === "highlight") {
    style.backgroundColor = a.color;
    style.opacity = opacity;
    // Multiply matches how the burn step draws it, so the preview and the
    // exported file look the same.
    style.mixBlendMode = "multiply";
  } else if (a.kind === "whiteout") {
    style.backgroundColor = "#ffffff";
  } else if (a.kind === "box") {
    style.border = `${stroke}px solid ${a.color}`;
    style.opacity = opacity;
  }

  return (
    <div
      style={style}
      onPointerDown={(e) => {
        if (!selectable) return;
        e.stopPropagation();
        onSelect();
        onBeginDrag("move", e);
      }}
    >
      {a.kind === "strikeout" && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: stroke,
            backgroundColor: a.color,
            opacity,
            transform: "translateY(-50%)",
          }}
        />
      )}
    </div>
  );
}

