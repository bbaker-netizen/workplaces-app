/**
 * Burning markup into a PDF.
 *
 * Takes the annotation rows for a document and draws them onto the page
 * content with pdf-lib, producing a flattened PDF that reads identically in
 * every viewer. This is the export step — the stored rows remain the editable
 * copy, and the original file is never touched (the caller files the output as
 * a NEW document version).
 *
 * Flattened, not native PDF annotations. A native annotation can be dragged
 * or deleted by whoever opens the file, which is wrong for a marked-up
 * document sent to a client: the markup is a statement about the document, not
 * a suggestion. Flattening also means it renders the same in Preview, a phone
 * mail client, and a printer, none of which agree on annotation rendering.
 *
 * TWO THINGS THAT WOULD SILENTLY MISPLACE MARKUP, both handled here:
 *
 *   1. CROP BOX vs MEDIA BOX. pdf.js renders the view box, so a page whose
 *      crop box is inset from its media box (common in anything print-prepped)
 *      would be offset by that inset if we positioned against the media box.
 *      Every coordinate below is resolved against `page.getCropBox()`, whose
 *      x/y are the inset itself.
 *
 *   2. PAGE ROTATION. Geometry needs no rotation maths, because capture
 *      already converted through pdf.js's viewport (see lib/pdf/annotations.ts).
 *      TEXT does: a page with /Rotate 90 is displayed rotated 90° clockwise,
 *      so glyphs drawn unrotated in user space would appear sideways. pdf-lib
 *      rotates counter-clockwise for positive degrees, so drawing at
 *      +angle cancels the viewer's clockwise rotation and the text reads
 *      correctly. Same reasoning gives the wrap width: on a quarter-turned
 *      page the reading direction runs along the user-space Y axis, so the box
 *      height is what constrains the line length.
 */

import {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";
import {
  DEFAULT_FONT_SIZE,
  type MarkupFont,
  DEFAULT_STROKE_WIDTH,
  hexToRgb01,
  toWinAnsi,
  type MarkupAnnotation,
  type NormalizedPoint,
} from "./annotations";

export type BurnResult = {
  bytes: Uint8Array;
  /** Markup that referenced a page the document no longer has. */
  skipped: number;
};

/**
 * Markup font key to the pdf-lib standard font.
 *
 * Only the standard fourteen are used, so nothing here needs embedding from
 * the source document — see MARKUP_FONTS in lib/pdf/annotations.ts for why.
 */
const STANDARD_FONT: Record<MarkupFont, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  "helvetica-bold": StandardFonts.HelveticaBold,
  "helvetica-oblique": StandardFonts.HelveticaOblique,
  "helvetica-boldoblique": StandardFonts.HelveticaBoldOblique,
  times: StandardFonts.TimesRoman,
  "times-bold": StandardFonts.TimesRomanBold,
  "times-italic": StandardFonts.TimesRomanItalic,
  "times-bolditalic": StandardFonts.TimesRomanBoldItalic,
  courier: StandardFonts.Courier,
  "courier-bold": StandardFonts.CourierBold,
  "courier-oblique": StandardFonts.CourierOblique,
  "courier-boldoblique": StandardFonts.CourierBoldOblique,
};

/** A page's crop box — the basis every normalized coordinate resolves against. */
type Basis = { x: number; y: number; width: number; height: number };

function basisOf(page: PDFPage): Basis {
  const box = page.getCropBox();
  // A degenerate crop box would divide by zero downstream. Fall back to the
  // page size, which is what a viewer does too.
  if (!box || box.width <= 0 || box.height <= 0) {
    const size = page.getSize();
    return { x: 0, y: 0, width: size.width, height: size.height };
  }
  return box;
}

function toUser(basis: Basis, nx: number, ny: number) {
  return { x: basis.x + nx * basis.width, y: basis.y + ny * basis.height };
}

/** Normalized rect (bottom-left + extent) to absolute user-space rect. */
function rectOf(basis: Basis, a: MarkupAnnotation) {
  const width = Math.abs(a.w) * basis.width;
  const height = Math.abs(a.h) * basis.height;
  const origin = toUser(basis, Math.min(a.x, a.x + a.w), Math.min(a.y, a.y + a.h));
  return { x: origin.x, y: origin.y, width, height };
}

export async function burnAnnotations(
  sourceBytes: ArrayBuffer | Uint8Array,
  annotations: MarkupAnnotation[],
): Promise<BurnResult> {
  const pdf = await PDFDocument.load(
    sourceBytes instanceof Uint8Array
      ? sourceBytes
      : new Uint8Array(sourceBytes),
    // A PDF with permission flags set but no password still opens for
    // markup; refusing would block ordinary client documents that were
    // exported with "no changes allowed" ticked by whoever produced them.
    { ignoreEncryption: true },
  );
  const pages = pdf.getPages();

  // Fonts are embedded lazily AND cached per key — a document marked up with
  // highlights only should carry no font at all, and one marked up in Times
  // throughout should embed Times once rather than per mark.
  const embedded = new Map<MarkupFont, PDFFont>();
  const font = async (key: MarkupFont | null) => {
    const k: MarkupFont = key ?? "helvetica";
    const hit = embedded.get(k);
    if (hit) return hit;
    const f = await pdf.embedFont(STANDARD_FONT[k]);
    embedded.set(k, f);
    return f;
  };

  let skipped = 0;

  // Draw in creation order so later markup sits on top of earlier markup,
  // matching what the editor showed. A whiteout drawn after a highlight must
  // cover it, not appear beneath it.
  for (const a of annotations) {
    const page = pages[a.pageNumber - 1];
    if (!page) {
      // Stale row: the page it referenced is gone. Skipping is right — the
      // alternative is drawing it onto whatever page now holds that index.
      skipped += 1;
      continue;
    }
    const basis = basisOf(page);
    const { r, g, b } = hexToRgb01(a.color);
    const color = rgb(r, g, b);
    const opacity = a.opacity ?? 1;

    switch (a.kind) {
      case "highlight": {
        const box = rectOf(basis, a);
        if (box.width <= 0 || box.height <= 0) break;
        page.drawRectangle({
          ...box,
          color,
          opacity,
          // Multiply is what makes a highlighter look like a highlighter:
          // the text underneath stays black instead of being veiled.
          blendMode: BlendMode.Multiply,
        });
        break;
      }

      case "whiteout": {
        const box = rectOf(basis, a);
        if (box.width <= 0 || box.height <= 0) break;
        // Opaque white, full stop. This is the cover half of
        // cover-and-retype, which is how a line of text actually gets
        // "edited" in a PDF.
        page.drawRectangle({ ...box, color: rgb(1, 1, 1), opacity: 1 });
        break;
      }

      case "box": {
        const box = rectOf(basis, a);
        if (box.width <= 0 || box.height <= 0) break;
        page.drawRectangle({
          ...box,
          borderColor: color,
          borderWidth: a.strokeWidth ?? DEFAULT_STROKE_WIDTH,
          borderOpacity: opacity,
          // No fill — an outline box is for circling something, not hiding it.
          opacity: 0,
          color: undefined,
        });
        break;
      }

      case "strikeout": {
        const box = rectOf(basis, a);
        if (box.width <= 0) break;
        const midY = box.y + box.height / 2;
        page.drawLine({
          start: { x: box.x, y: midY },
          end: { x: box.x + box.width, y: midY },
          thickness: a.strokeWidth ?? DEFAULT_STROKE_WIDTH,
          color,
          opacity,
          lineCap: LineCapStyle.Round,
        });
        break;
      }

      case "ink": {
        const pts = normalizePoints(a.points);
        if (pts.length < 2) break;
        const thickness = a.strokeWidth ?? DEFAULT_STROKE_WIDTH;
        // Drawn as consecutive segments with round caps rather than one path:
        // pdf-lib's SVG path helper flips the y axis for its own coordinate
        // convention, which is a second transform to get wrong for no gain.
        for (let i = 1; i < pts.length; i += 1) {
          const from = toUser(basis, pts[i - 1].x, pts[i - 1].y);
          const to = toUser(basis, pts[i].x, pts[i].y);
          page.drawLine({
            start: from,
            end: to,
            thickness,
            color,
            opacity,
            lineCap: LineCapStyle.Round,
          });
        }
        break;
      }

      case "image": {
        if (!a.imageData) break;
        const box = rectOf(basis, a);
        if (box.width <= 0 || box.height <= 0) break;
        const embedded = await embedDataUrl(pdf, a.imageData);
        if (!embedded) break;
        page.drawImage(embedded, { ...box, opacity });
        break;
      }

      case "text": {
        const raw = (a.body ?? "").trim();
        if (!raw) break;
        const size = a.fontSize ?? DEFAULT_FONT_SIZE;
        const f = await font(a.font);
        const angle = normalizeAngle(page.getRotation().angle);
        const quarterTurned = angle === 90 || angle === 270;

        // Wrap along the reading direction. On a quarter-turned page that
        // runs down the user-space Y axis, so the box's height is the limit.
        const boxWidth = Math.abs(a.w) * basis.width;
        const boxHeight = Math.abs(a.h) * basis.height;
        const wrapWidth = quarterTurned ? boxHeight : boxWidth;

        const lines = wrapToWidth(toWinAnsi(raw), f, size, wrapWidth);
        const anchor = toUser(
          basis,
          Math.min(a.x, a.x + a.w),
          Math.max(a.y, a.y + a.h),
        );

        // Successive lines advance opposite the text's "up" direction, which
        // rotates with the page.
        const lineHeight = size * 1.2;
        const step = advanceForAngle(angle, lineHeight);

        lines.forEach((line, i) => {
          page.drawText(line, {
            x: anchor.x + step.x * i,
            // First baseline sits one line below the top edge of the box.
            y: anchor.y + step.y * (i + 1),
            size,
            font: f,
            color,
            opacity,
            rotate: degrees(angle),
          });
        });
        break;
      }
    }
  }

  const bytes = await pdf.save();
  return { bytes, skipped };
}

/**
 * Per-line advance, in user space, for a page displayed at `angle`.
 *
 * At 0° text reads left-to-right and lines stack downward (-y). Each quarter
 * turn rotates that stacking direction with the page.
 */
function advanceForAngle(
  angle: number,
  lineHeight: number,
): { x: number; y: number } {
  switch (angle) {
    case 90:
      return { x: lineHeight, y: 0 };
    case 180:
      return { x: 0, y: lineHeight };
    case 270:
      return { x: -lineHeight, y: 0 };
    default:
      return { x: 0, y: -lineHeight };
  }
}

function normalizeAngle(angle: number): 0 | 90 | 180 | 270 {
  const a = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return (a === 90 || a === 180 || a === 270 ? a : 0) as 0 | 90 | 180 | 270;
}

function normalizePoints(points: unknown): NormalizedPoint[] {
  if (!Array.isArray(points)) return [];
  const out: NormalizedPoint[] = [];
  for (const p of points) {
    if (
      p &&
      typeof p === "object" &&
      typeof (p as NormalizedPoint).x === "number" &&
      typeof (p as NormalizedPoint).y === "number" &&
      Number.isFinite((p as NormalizedPoint).x) &&
      Number.isFinite((p as NormalizedPoint).y)
    ) {
      out.push({ x: (p as NormalizedPoint).x, y: (p as NormalizedPoint).y });
    }
  }
  return out;
}

/**
 * Word wrap against real glyph widths.
 *
 * A word longer than the line (a pasted URL, an account number) is broken
 * mid-word rather than allowed to run off the page edge.
 */
export function wrapToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const paragraphs = text.split(/\r?\n/);
  // No usable width (a click rather than a drag) — one line per paragraph and
  // let it run; the alternative is wrapping every character.
  if (!(maxWidth > 1)) return paragraphs;

  const lines: string[] = [];
  for (const para of paragraphs) {
    if (para.trim() === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of para.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      // Hard-break the oversized word.
      let chunk = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      current = chunk;
    }
    if (current) lines.push(current);
  }
  return lines;
}

async function embedDataUrl(pdf: PDFDocument, dataUrl: string) {
  const match = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl.trim(),
  );
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  try {
    return match[1] === "png"
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
  } catch (e) {
    // A corrupt stamp should cost that stamp, not the export.
    console.error("[pdf/burn] image embed failed:", e);
    return null;
  }
}
