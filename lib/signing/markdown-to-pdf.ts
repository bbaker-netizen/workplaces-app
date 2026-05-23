/**
 * Markdown → PDF renderer for the native signing flow.
 *
 * pdf-lib is low-level (no automatic text wrapping), so this layer
 * does the heavy lifting: word-wraps each paragraph, switches fonts
 * for bold inline runs, handles multi-line headings, lays out bullet
 * lists, and breaks pages when content overflows.
 *
 * Supported markdown subset (matches what the Tiptap composer in the
 * template editor emits):
 *   - Paragraphs separated by blank lines
 *   - `#`, `##`, `###` headings
 *   - `**bold**` inline
 *   - `- item` / `* item` bullet lists
 *
 * Output: Uint8Array (PDF bytes). Caller stores it via Netlify Blobs
 * + a `documents` row, then uses it as the source for a signature
 * envelope.
 *
 * Page format: US Letter (8.5" × 11"). 1" margins. Helvetica family.
 * Header: engagement / company name + date. Footer: page number +
 * "Electronically prepared with The Builder · By Workplaces".
 */

import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 612; // 8.5" × 72pt
const PAGE_HEIGHT = 792; // 11" × 72pt
const MARGIN = 72; // 1"
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HEADER_HEIGHT = 36;
const FOOTER_HEIGHT = 36;
const CONTENT_TOP = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT;
const CONTENT_BOTTOM = MARGIN + FOOTER_HEIGHT;

const FONT_BODY = 11;
const FONT_H1 = 22;
const FONT_H2 = 16;
const FONT_H3 = 13;
const LINE_HEIGHT_BODY = 1.5;
const LINE_HEIGHT_HEADING = 1.25;
const PARAGRAPH_SPACING = 8;
const HEADING_SPACING_BEFORE = 16;
const HEADING_SPACING_AFTER = 6;
const BULLET_INDENT = 18;

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const STEEL_BLUE = rgb(46 / 255, 64 / 255, 87 / 255);

export type MarkdownPdfHeader = {
  /** Top-left title — usually the engagement / company name. */
  title?: string;
  /** Top-right date string. Falls back to today if omitted. */
  date?: string;
};

export type MarkdownPdfOptions = {
  title: string;
  bodyMarkdown: string;
  header?: MarkdownPdfHeader;
};

export async function renderMarkdownToPdf(
  options: MarkdownPdfOptions,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  pdf.setTitle(options.title);
  pdf.setProducer("The Builder · By Workplaces");
  pdf.setCreator("The Builder · By Workplaces");

  const ctx: RenderCtx = {
    pdf,
    fonts: { regular, bold, italic },
    header: {
      title: options.header?.title ?? "",
      date: options.header?.date ?? defaultDateString(),
    },
    pageNum: 0,
    page: null as unknown as ReturnType<typeof pdf.addPage>,
    cursorY: 0,
    totalPages: 0,
  };

  // First page setup
  startNewPage(ctx);

  // Title block
  drawTextRun(ctx, options.title, {
    font: bold,
    size: FONT_H1,
    color: STEEL_BLUE,
    lineHeight: LINE_HEIGHT_HEADING,
  });
  ctx.cursorY -= HEADING_SPACING_AFTER * 1.5;

  // Body
  renderMarkdown(ctx, options.bodyMarkdown);

  // Stamp page numbers on every page now that we know the total.
  ctx.totalPages = pdf.getPageCount();
  for (let i = 0; i < ctx.totalPages; i++) {
    drawFooter(ctx, pdf.getPage(i), i + 1);
  }

  return pdf.save();
}

/* --------------------------- internals --------------------------- */

type RenderCtx = {
  pdf: PDFDocument;
  fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont };
  header: { title: string; date: string };
  pageNum: number;
  page: ReturnType<PDFDocument["addPage"]>;
  cursorY: number;
  totalPages: number;
};

function defaultDateString(): string {
  return new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function startNewPage(ctx: RenderCtx): void {
  const page = ctx.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.page = page;
  ctx.pageNum += 1;
  ctx.cursorY = CONTENT_TOP;
  drawHeader(ctx, page);
}

function drawHeader(
  ctx: RenderCtx,
  page: ReturnType<PDFDocument["addPage"]>,
): void {
  const y = PAGE_HEIGHT - MARGIN + 10;
  if (ctx.header.title) {
    page.drawText(ctx.header.title, {
      x: MARGIN,
      y,
      size: 9,
      font: ctx.fonts.bold,
      color: STEEL_BLUE,
    });
  }
  const dateWidth = ctx.fonts.regular.widthOfTextAtSize(ctx.header.date, 9);
  page.drawText(ctx.header.date, {
    x: PAGE_WIDTH - MARGIN - dateWidth,
    y,
    size: 9,
    font: ctx.fonts.regular,
    color: MUTED,
  });
  // Thin rule under the header.
  page.drawLine({
    start: { x: MARGIN, y: y - 6 },
    end: { x: PAGE_WIDTH - MARGIN, y: y - 6 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
}

function drawFooter(
  ctx: RenderCtx,
  page: ReturnType<PDFDocument["addPage"]>,
  pageNum: number,
): void {
  const y = MARGIN - 24;
  const pageLabel = `${pageNum} / ${ctx.totalPages}`;
  const pageW = ctx.fonts.regular.widthOfTextAtSize(pageLabel, 9);
  page.drawText(pageLabel, {
    x: (PAGE_WIDTH - pageW) / 2,
    y,
    size: 9,
    font: ctx.fonts.regular,
    color: MUTED,
  });
  const credit = "Prepared with The Builder · By Workplaces";
  const creditW = ctx.fonts.regular.widthOfTextAtSize(credit, 8);
  page.drawText(credit, {
    x: (PAGE_WIDTH - creditW) / 2,
    y: y - 12,
    size: 8,
    font: ctx.fonts.italic,
    color: MUTED,
  });
}

/* --------------------------- block parsing --------------------------- */

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; runs: InlineRun[] }
  | { kind: "li"; runs: InlineRun[] };

type InlineRun = { text: string; bold: boolean };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let buf: string[] = [];

  const flushParagraph = () => {
    const joined = buf.join(" ").trim();
    if (joined) blocks.push({ kind: "p", runs: parseInline(joined) });
    buf = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    const h1 = /^#\s+(.+)$/.exec(line);
    const h2 = /^##\s+(.+)$/.exec(line);
    const h3 = /^###\s+(.+)$/.exec(line);
    const li = /^[-*]\s+(.+)$/.exec(line);
    if (h1) {
      flushParagraph();
      blocks.push({ kind: "h1", text: h1[1].trim() });
      continue;
    }
    if (h2) {
      flushParagraph();
      blocks.push({ kind: "h2", text: h2[1].trim() });
      continue;
    }
    if (h3) {
      flushParagraph();
      blocks.push({ kind: "h3", text: h3[1].trim() });
      continue;
    }
    if (li) {
      flushParagraph();
      blocks.push({ kind: "li", runs: parseInline(li[1].trim()) });
      continue;
    }
    buf.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push({ text: text.slice(last, m.index), bold: false });
    }
    runs.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    runs.push({ text: text.slice(last), bold: false });
  }
  return runs.length > 0 ? runs : [{ text, bold: false }];
}

/* --------------------------- layout / draw --------------------------- */

function renderMarkdown(ctx: RenderCtx, markdown: string): void {
  const blocks = parseBlocks(markdown);
  for (const block of blocks) {
    drawBlock(ctx, block);
  }
}

function drawBlock(ctx: RenderCtx, block: Block): void {
  switch (block.kind) {
    case "h1":
    case "h2":
    case "h3": {
      const size =
        block.kind === "h1" ? FONT_H2 : block.kind === "h2" ? FONT_H3 : 12;
      ctx.cursorY -= HEADING_SPACING_BEFORE;
      drawTextRun(ctx, block.text, {
        font: ctx.fonts.bold,
        size,
        color: STEEL_BLUE,
        lineHeight: LINE_HEIGHT_HEADING,
      });
      ctx.cursorY -= HEADING_SPACING_AFTER;
      break;
    }
    case "p": {
      drawRuns(ctx, block.runs, {
        size: FONT_BODY,
        lineHeight: LINE_HEIGHT_BODY,
        indent: 0,
      });
      ctx.cursorY -= PARAGRAPH_SPACING;
      break;
    }
    case "li": {
      // Bullet glyph
      ensureSpace(ctx, FONT_BODY * LINE_HEIGHT_BODY);
      ctx.page.drawText("•", {
        x: MARGIN,
        y: ctx.cursorY - FONT_BODY,
        size: FONT_BODY,
        font: ctx.fonts.regular,
        color: INK,
      });
      drawRuns(ctx, block.runs, {
        size: FONT_BODY,
        lineHeight: LINE_HEIGHT_BODY,
        indent: BULLET_INDENT,
      });
      ctx.cursorY -= 2;
      break;
    }
  }
}

function drawTextRun(
  ctx: RenderCtx,
  text: string,
  opts: {
    font: PDFFont;
    size: number;
    color: ReturnType<typeof rgb>;
    lineHeight: number;
  },
): void {
  drawRuns(
    ctx,
    [{ text, bold: opts.font === ctx.fonts.bold }],
    {
      size: opts.size,
      lineHeight: opts.lineHeight,
      indent: 0,
      color: opts.color,
    },
  );
}

function drawRuns(
  ctx: RenderCtx,
  runs: InlineRun[],
  opts: {
    size: number;
    lineHeight: number;
    indent: number;
    color?: ReturnType<typeof rgb>;
  },
): void {
  const color = opts.color ?? INK;
  const lineHeightPt = opts.size * opts.lineHeight;
  const lineWidthLimit = CONTENT_WIDTH - opts.indent;

  // Tokenise into words while preserving which font each word should use.
  type Token = { text: string; font: PDFFont; widthPt: number };
  const tokens: Token[] = [];
  for (const run of runs) {
    const font = run.bold ? ctx.fonts.bold : ctx.fonts.regular;
    const parts = run.text.split(/(\s+)/); // keep whitespace tokens for spacing
    for (const part of parts) {
      if (part.length === 0) continue;
      tokens.push({
        text: part,
        font,
        widthPt: font.widthOfTextAtSize(part, opts.size),
      });
    }
  }

  // Greedy line break.
  let currentLine: Token[] = [];
  let currentWidth = 0;
  const flushLine = () => {
    if (currentLine.length === 0) return;
    ensureSpace(ctx, lineHeightPt);
    let x = MARGIN + opts.indent;
    const y = ctx.cursorY - opts.size;
    for (const tok of currentLine) {
      ctx.page.drawText(tok.text, {
        x,
        y,
        size: opts.size,
        font: tok.font,
        color,
      });
      x += tok.widthPt;
    }
    ctx.cursorY -= lineHeightPt;
    currentLine = [];
    currentWidth = 0;
  };

  for (const tok of tokens) {
    // Tokens that are only whitespace shouldn't push beyond the limit
    // alone; they just join.
    const isSpace = /^\s+$/.test(tok.text);
    if (currentLine.length === 0 && isSpace) continue;
    if (currentWidth + tok.widthPt > lineWidthLimit && !isSpace) {
      flushLine();
    }
    currentLine.push(tok);
    currentWidth += tok.widthPt;
  }
  flushLine();
}

function ensureSpace(ctx: RenderCtx, needed: number): void {
  if (ctx.cursorY - needed < CONTENT_BOTTOM) {
    startNewPage(ctx);
  }
}
