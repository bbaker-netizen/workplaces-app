/**
 * PDF markup — the shared contract between the browser editor and the
 * server-side burn step.
 *
 * This module is imported by BOTH a client component and a server action, so
 * it must stay free of server-only imports (no drizzle, no node:crypto, no
 * pdf-lib). Types and pure helpers only.
 *
 * THE COORDINATE CONTRACT, stated once so both sides cannot drift:
 *
 *   x, y, w, h are FRACTIONS (0..1) of the page's crop box, with the origin
 *   at the BOTTOM-LEFT and y increasing upward — i.e. normalized PDF user
 *   space, not screen space.
 *
 * The browser never stores pixels. It converts every captured point through
 * pdf.js's `viewport.convertToPdfPoint()`, which already accounts for the
 * current zoom AND the page's /Rotate entry, then divides by the crop-box
 * size. Two consequences worth knowing:
 *
 *   - Zoom independence: markup captured at 150% lands in the same place
 *     when the page is re-rendered at any other scale.
 *   - Rotation is resolved before storage, so the burn step needs no rotation
 *     maths to POSITION anything. It still needs it to ORIENT text — see
 *     `lib/pdf/burn.ts`.
 *
 * Crop box, not media box: pdf.js renders the view box (the crop box where
 * one is set), so normalizing against the media box would misplace markup on
 * any print-prepped PDF where the two differ.
 */

export const ANNOTATION_KINDS = [
  "text",
  "highlight",
  "ink",
  "whiteout",
  "box",
  "strikeout",
  "image",
] as const;

export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export function isAnnotationKind(v: unknown): v is AnnotationKind {
  return (
    typeof v === "string" &&
    (ANNOTATION_KINDS as readonly string[]).includes(v)
  );
}

/** A point in normalized PDF user space. */
export type NormalizedPoint = { x: number; y: number };

export type MarkupAnnotation = {
  id: string;
  pageNumber: number;
  kind: AnnotationKind;
  /** Bottom-left corner, as a fraction of the crop box. */
  x: number;
  y: number;
  /** Extent, as a fraction of the crop box. Zero for a bare ink stroke. */
  w: number;
  h: number;
  /** Freehand ink path. Null for every other kind. */
  points: NormalizedPoint[] | null;
  /** Typed text, for kind='text'. */
  body: string | null;
  color: string;
  /** Points (PDF units), for kind='text'. */
  fontSize: number | null;
  /** Points (PDF units), for ink / box / strikeout. */
  strokeWidth: number | null;
  opacity: number | null;
  /** Data URL, for kind='image'. */
  imageData: string | null;
};

/**
 * Markup colours.
 *
 * A deliberate, narrow departure from CLAUDE.md's "do not introduce
 * variants" rule, which governs UI chrome. These are tool colours — ink in a
 * pen, not a button fill — and a markup set without a highlighter yellow or a
 * correction red would not do the job. Every surrounding control still uses
 * the brand palette exactly.
 */
export const MARKUP_COLORS = [
  { label: "Black", hex: "#1A1A1A" },
  { label: "Steel", hex: "#2E4057" },
  { label: "Orange", hex: "#E87722" },
  { label: "Red", hex: "#C1121F" },
  { label: "Yellow", hex: "#FFD54A" },
] as const;

export const DEFAULT_FONT_SIZE = 12;
export const DEFAULT_STROKE_WIDTH = 2;
/** Highlighter sits under a multiply blend, so it can be fairly strong. */
export const DEFAULT_HIGHLIGHT_OPACITY = 0.45;

/** Per-kind default opacity. Whiteout must be fully opaque to cover. */
export function defaultOpacityFor(kind: AnnotationKind): number {
  if (kind === "highlight") return DEFAULT_HIGHLIGHT_OPACITY;
  return 1;
}

/** Which kinds are drawn by dragging a rectangle. */
export function isRectKind(kind: AnnotationKind): boolean {
  return (
    kind === "highlight" ||
    kind === "whiteout" ||
    kind === "box" ||
    kind === "strikeout" ||
    kind === "image"
  );
}

const HEX = /^#([0-9a-fA-F]{6})$/;

/**
 * Hex to 0..1 RGB components, for pdf-lib's `rgb()` and for canvas.
 * Falls back to Foreman Black rather than throwing — a bad colour should
 * not fail a whole export.
 */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = HEX.exec(hex.trim());
  if (!m) return { r: 0.102, g: 0.102, b: 0.102 };
  const n = parseInt(m[1], 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}

/** Clamp a normalized coordinate into [0,1]. */
export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Text that pdf-lib's standard fonts can actually encode.
 *
 * StandardFonts.Helvetica is WinAnsi, and pdf-lib THROWS on any character
 * outside it. Bruce types prose — em dashes, curly quotes and ellipses arrive
 * constantly from anything pasted out of Word or an email. Without this, one
 * smart quote in a note fails the entire export, so the substitutions happen
 * here rather than being left to chance.
 */
export function toWinAnsi(input: string): string {
  return input
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[•●]/g, "-")
    .replace(/→/g, "->")
    .replace(/\t/g, "    ")
    // Anything still outside Latin-1 would throw on encode. A visible
    // placeholder beats a failed export.
    .replace(/[^\x00-\xFF]/g, "?");
}
