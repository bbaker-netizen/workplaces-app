/**
 * Body → PDF renderer for the native signing flow.
 *
 * Accepts either markdown (legacy) or HTML (new, what the Tiptap editor
 * now emits) and produces a Workplaces-branded PDF. Auto-detects which
 * format the body is in by sniffing the first non-whitespace character.
 *
 * pdf-lib is low-level (no automatic text wrapping), so this layer
 * does the heavy lifting: word-wraps each paragraph, switches fonts
 * for bold/italic/underline inline runs, handles multi-line headings,
 * lays out bullet/numbered lists, applies block-level alignment
 * (left/center/right/justify), and breaks pages when content overflows.
 *
 * Supported HTML subset:
 *   - <p>, <p style="text-align: center|right|justify"> paragraphs
 *   - <h1>, <h2>, <h3> headings (alignment honored)
 *   - <strong> / <b>, <em> / <i>, <u>, <s> inline marks
 *   - <ul><li> and <ol><li> lists
 *   - <blockquote> indented quote blocks
 *   - <a href> links — rendered as the text (link target stays in the
 *     HTML for email rendering paths; PDFs don't get a clickable
 *     hyperlink because pdf-lib's annotation API would need a separate
 *     pass)
 *   - <br> hard breaks within paragraphs
 *
 * Supported markdown subset (legacy):
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
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);

  pdf.setTitle(options.title);
  pdf.setProducer("The Builder · By Workplaces");
  pdf.setCreator("The Builder · By Workplaces");

  const ctx: RenderCtx = {
    pdf,
    fonts: { regular, bold, italic, boldItalic },
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

  // Body — auto-detect HTML vs markdown by sniffing the first
  // non-whitespace character.
  const body = options.bodyMarkdown;
  if (body.trim().startsWith("<")) {
    renderHtml(ctx, body);
  } else {
    renderMarkdown(ctx, body);
  }

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
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    boldItalic: PDFFont;
  };
  header: { title: string; date: string };
  pageNum: number;
  page: ReturnType<PDFDocument["addPage"]>;
  cursorY: number;
  totalPages: number;
};

type Align = "left" | "center" | "right" | "justify";

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
  | {
      kind: "h1" | "h2" | "h3";
      runs: InlineRun[];
      align: Align;
    }
  | { kind: "p"; runs: InlineRun[]; align: Align }
  | { kind: "li"; runs: InlineRun[]; ordered: boolean; index: number }
  | { kind: "quote"; runs: InlineRun[] }
  | { kind: "spacer" };

type InlineRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

function emptyRun(text: string): InlineRun {
  return { text, bold: false, italic: false, underline: false };
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let buf: string[] = [];

  const flushParagraph = () => {
    const joined = buf.join(" ").trim();
    if (joined) blocks.push({ kind: "p", runs: parseInline(joined), align: "left" });
    buf = [];
  };

  let liIndex = 0;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") {
      flushParagraph();
      liIndex = 0;
      continue;
    }
    const h1 = /^#\s+(.+)$/.exec(line);
    const h2 = /^##\s+(.+)$/.exec(line);
    const h3 = /^###\s+(.+)$/.exec(line);
    const li = /^[-*]\s+(.+)$/.exec(line);
    if (h1) {
      flushParagraph();
      blocks.push({ kind: "h1", runs: parseInline(h1[1].trim()), align: "left" });
      continue;
    }
    if (h2) {
      flushParagraph();
      blocks.push({ kind: "h2", runs: parseInline(h2[1].trim()), align: "left" });
      continue;
    }
    if (h3) {
      flushParagraph();
      blocks.push({ kind: "h3", runs: parseInline(h3[1].trim()), align: "left" });
      continue;
    }
    if (li) {
      flushParagraph();
      blocks.push({
        kind: "li",
        runs: parseInline(li[1].trim()),
        ordered: false,
        index: ++liIndex,
      });
      continue;
    }
    buf.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

function parseInline(text: string): InlineRun[] {
  // Tokenise on **bold** spans only — markdown legacy path stays simple.
  const runs: InlineRun[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push(emptyRun(text.slice(last, m.index)));
    }
    runs.push({ text: m[1], bold: true, italic: false, underline: false });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    runs.push(emptyRun(text.slice(last)));
  }
  return runs.length > 0 ? runs : [emptyRun(text)];
}

/* --------------------------- HTML parsing --------------------------- */

/**
 * Small purpose-built HTML parser for the Tiptap output. We don't pull
 * in a real DOM library (jsdom is huge) — Tiptap emits a small, well-
 * defined HTML subset and a regex/state-machine approach handles it
 * predictably. The parser walks tokens, maintains a stack of active
 * inline marks (b/strong, i/em, u, s), and emits Block objects.
 */
function parseHtmlBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  // Split into tag tokens vs text tokens.
  const tokens = tokenizeHtml(html);

  // Per-block state.
  let blockType: "p" | "h1" | "h2" | "h3" | "li" | "quote" | null = null;
  let blockAlign: Align = "left";
  let blockOrdered = false;
  let blockLiIndex = 0;
  let runs: InlineRun[] = [];
  let buffer = "";
  // Mark stack — each push adds a flag, pop removes it.
  const marks = { bold: 0, italic: 0, underline: 0 };
  let inList: "ul" | "ol" | null = null;

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    runs.push({
      text: buffer,
      bold: marks.bold > 0,
      italic: marks.italic > 0,
      underline: marks.underline > 0,
    });
    buffer = "";
  };

  const closeBlock = () => {
    flushBuffer();
    // Merge trailing whitespace-only runs.
    const meaningful = runs.some((r) => r.text.trim().length > 0);
    if (!meaningful) {
      // Empty paragraph → emit a spacer block so blank lines from the
      // editor preserve their visual gap.
      if (blockType === "p") blocks.push({ kind: "spacer" });
      runs = [];
      blockType = null;
      blockAlign = "left";
      return;
    }
    if (blockType === "p") {
      blocks.push({ kind: "p", runs, align: blockAlign });
    } else if (blockType === "h1" || blockType === "h2" || blockType === "h3") {
      blocks.push({ kind: blockType, runs, align: blockAlign });
    } else if (blockType === "li") {
      blocks.push({
        kind: "li",
        runs,
        ordered: blockOrdered,
        index: blockLiIndex,
      });
    } else if (blockType === "quote") {
      blocks.push({ kind: "quote", runs });
    }
    runs = [];
    blockType = null;
    blockAlign = "left";
  };

  for (const tok of tokens) {
    if (tok.kind === "text") {
      // Decode HTML entities so they render correctly in the PDF.
      const decoded = decodeEntities(tok.text);
      // Normalize whitespace inside text nodes (collapse runs of
      // whitespace to a single space, matching browser behavior).
      const normalized = decoded.replace(/\s+/g, " ");
      // Skip pure whitespace text between block tags.
      if (blockType === null && normalized.trim().length === 0) continue;
      if (blockType === null) {
        // Implicit paragraph for stray text.
        blockType = "p";
        blockAlign = "left";
      }
      buffer += normalized;
      continue;
    }
    // tag token
    const tagName = tok.name;
    if (tok.closing) {
      switch (tagName) {
        case "strong":
        case "b":
          marks.bold = Math.max(0, marks.bold - 1);
          flushBuffer();
          break;
        case "em":
        case "i":
          marks.italic = Math.max(0, marks.italic - 1);
          flushBuffer();
          break;
        case "u":
          marks.underline = Math.max(0, marks.underline - 1);
          flushBuffer();
          break;
        case "s":
        case "strike":
        case "del":
          // No PDF strikethrough mark in this renderer — drop.
          flushBuffer();
          break;
        case "a":
          // Drop the link mark — text continues, href is lost in PDF.
          flushBuffer();
          break;
        case "p":
        case "h1":
        case "h2":
        case "h3":
        case "li":
        case "blockquote":
          closeBlock();
          break;
        case "ul":
        case "ol":
          inList = null;
          break;
        default:
          break;
      }
    } else {
      // Opening tag
      switch (tagName) {
        case "strong":
        case "b":
          flushBuffer();
          marks.bold += 1;
          break;
        case "em":
        case "i":
          flushBuffer();
          marks.italic += 1;
          break;
        case "u":
          flushBuffer();
          marks.underline += 1;
          break;
        case "s":
        case "strike":
        case "del":
          flushBuffer();
          break;
        case "a":
          flushBuffer();
          break;
        case "br":
          // Treat hard breaks within a paragraph as a newline-flagged
          // empty run. Simpler: insert two spaces as a visual gap.
          // For genuine layout fidelity we'd break the block here, but
          // ProseMirror's editor rarely emits <br> — fine to coalesce.
          buffer += " ";
          break;
        case "p":
          closeBlock();
          blockType = "p";
          blockAlign = parseTextAlign(tok.attrs);
          break;
        case "h1":
          closeBlock();
          blockType = "h1";
          blockAlign = parseTextAlign(tok.attrs);
          break;
        case "h2":
          closeBlock();
          blockType = "h2";
          blockAlign = parseTextAlign(tok.attrs);
          break;
        case "h3":
          closeBlock();
          blockType = "h3";
          blockAlign = parseTextAlign(tok.attrs);
          break;
        case "ul":
          closeBlock();
          inList = "ul";
          blockLiIndex = 0;
          break;
        case "ol":
          closeBlock();
          inList = "ol";
          blockLiIndex = 0;
          break;
        case "li":
          closeBlock();
          blockType = "li";
          blockOrdered = inList === "ol";
          blockLiIndex += 1;
          break;
        case "blockquote":
          closeBlock();
          blockType = "quote";
          break;
        default:
          // Ignore unknown tags (divs, spans, etc.).
          break;
      }
    }
  }
  closeBlock();
  return blocks;
}

type HtmlToken =
  | { kind: "text"; text: string }
  | { kind: "tag"; name: string; closing: boolean; attrs: string };

function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === "<") {
      const end = html.indexOf(">", i);
      if (end === -1) break;
      const raw = html.slice(i + 1, end);
      const closing = raw.startsWith("/");
      const body = closing ? raw.slice(1) : raw;
      const spaceIdx = body.search(/\s/);
      const name = (spaceIdx === -1 ? body : body.slice(0, spaceIdx))
        .toLowerCase()
        .replace(/\/$/, "")
        .trim();
      const attrs = spaceIdx === -1 ? "" : body.slice(spaceIdx + 1);
      tokens.push({ kind: "tag", name, closing, attrs });
      i = end + 1;
    } else {
      const next = html.indexOf("<", i);
      const text = html.slice(i, next === -1 ? html.length : next);
      if (text.length > 0) tokens.push({ kind: "text", text });
      if (next === -1) break;
      i = next;
    }
  }
  return tokens;
}

function parseTextAlign(attrs: string): Align {
  const styleMatch = /style="([^"]*)"/.exec(attrs);
  if (!styleMatch) return "left";
  const style = styleMatch[1];
  const alignMatch = /text-align\s*:\s*(left|center|right|justify)/i.exec(style);
  if (!alignMatch) return "left";
  return alignMatch[1].toLowerCase() as Align;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/* --------------------------- layout / draw --------------------------- */

function renderMarkdown(ctx: RenderCtx, markdown: string): void {
  const blocks = parseBlocks(markdown);
  for (const block of blocks) {
    drawBlock(ctx, block);
  }
}

function renderHtml(ctx: RenderCtx, html: string): void {
  const blocks = parseHtmlBlocks(html);
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
      // Force the bold treatment on every run within the heading. We
      // also pass through alignment.
      const boldified = block.runs.map((r) => ({ ...r, bold: true }));
      drawRuns(ctx, boldified, {
        size,
        lineHeight: LINE_HEIGHT_HEADING,
        indent: 0,
        color: STEEL_BLUE,
        align: block.align,
      });
      ctx.cursorY -= HEADING_SPACING_AFTER;
      break;
    }
    case "p": {
      drawRuns(ctx, block.runs, {
        size: FONT_BODY,
        lineHeight: LINE_HEIGHT_BODY,
        indent: 0,
        align: block.align,
      });
      ctx.cursorY -= PARAGRAPH_SPACING;
      break;
    }
    case "li": {
      // Bullet / number glyph
      ensureSpace(ctx, FONT_BODY * LINE_HEIGHT_BODY);
      const marker = block.ordered ? `${block.index}.` : "•";
      ctx.page.drawText(marker, {
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
        align: "left",
      });
      ctx.cursorY -= 2;
      break;
    }
    case "quote": {
      // Indented block with a left rule. Render text indented, then
      // overlay the rule retroactively (we know how many lines we drew
      // by tracking cursorY before/after).
      const yStart = ctx.cursorY;
      drawRuns(ctx, block.runs, {
        size: FONT_BODY,
        lineHeight: LINE_HEIGHT_BODY,
        indent: BULLET_INDENT,
        align: "left",
        color: MUTED,
        italic: true,
      });
      const yEnd = ctx.cursorY;
      ctx.page.drawLine({
        start: { x: MARGIN + 4, y: yStart - 2 },
        end: { x: MARGIN + 4, y: yEnd + 6 },
        thickness: 1.5,
        color: STEEL_BLUE,
      });
      ctx.cursorY -= PARAGRAPH_SPACING;
      break;
    }
    case "spacer": {
      // Empty paragraph → preserve the gap visually.
      ctx.cursorY -= FONT_BODY * LINE_HEIGHT_BODY;
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
    [
      {
        text,
        bold: opts.font === ctx.fonts.bold,
        italic: false,
        underline: false,
      },
    ],
    {
      size: opts.size,
      lineHeight: opts.lineHeight,
      indent: 0,
      color: opts.color,
      align: "left",
    },
  );
}

function fontFor(
  ctx: RenderCtx,
  bold: boolean,
  italic: boolean,
): PDFFont {
  if (bold && italic) return ctx.fonts.boldItalic;
  if (bold) return ctx.fonts.bold;
  if (italic) return ctx.fonts.italic;
  return ctx.fonts.regular;
}

function drawRuns(
  ctx: RenderCtx,
  runs: InlineRun[],
  opts: {
    size: number;
    lineHeight: number;
    indent: number;
    color?: ReturnType<typeof rgb>;
    align?: Align;
    /** Force italic on all runs (used for blockquotes). */
    italic?: boolean;
  },
): void {
  const color = opts.color ?? INK;
  const align = opts.align ?? "left";
  const forceItalic = opts.italic ?? false;
  const lineHeightPt = opts.size * opts.lineHeight;
  const lineWidthLimit = CONTENT_WIDTH - opts.indent;

  // Tokenise into words while preserving which font + underline each
  // word should use.
  type Token = {
    text: string;
    font: PDFFont;
    widthPt: number;
    underline: boolean;
  };
  const tokens: Token[] = [];
  for (const run of runs) {
    const italic = forceItalic || run.italic;
    const font = fontFor(ctx, run.bold, italic);
    const parts = run.text.split(/(\s+)/); // keep whitespace tokens for spacing
    for (const part of parts) {
      if (part.length === 0) continue;
      tokens.push({
        text: part,
        font,
        widthPt: font.widthOfTextAtSize(part, opts.size),
        underline: run.underline,
      });
    }
  }

  // Greedy line break.
  let currentLine: Token[] = [];
  let currentWidth = 0;
  const flushLine = (isLastLine: boolean) => {
    if (currentLine.length === 0) return;
    ensureSpace(ctx, lineHeightPt);
    // Strip leading/trailing whitespace tokens from the visible line
    // so alignment math doesn't include them.
    while (currentLine.length > 0 && /^\s+$/.test(currentLine[0].text)) {
      currentWidth -= currentLine[0].widthPt;
      currentLine.shift();
    }
    while (
      currentLine.length > 0 &&
      /^\s+$/.test(currentLine[currentLine.length - 1].text)
    ) {
      currentWidth -= currentLine[currentLine.length - 1].widthPt;
      currentLine.pop();
    }
    if (currentLine.length === 0) {
      ctx.cursorY -= lineHeightPt;
      currentWidth = 0;
      return;
    }
    // Compute X start based on alignment.
    let x = MARGIN + opts.indent;
    const extraSpace = lineWidthLimit - currentWidth;
    if (align === "center") {
      x = MARGIN + opts.indent + extraSpace / 2;
    } else if (align === "right") {
      x = MARGIN + opts.indent + extraSpace;
    }
    // Justify spreads the extra space across whitespace tokens — but
    // not on the last line of a paragraph (standard justify behavior).
    let extraPerSpace = 0;
    if (align === "justify" && !isLastLine) {
      const spaceCount = currentLine.filter((t) => /^\s+$/.test(t.text)).length;
      if (spaceCount > 0 && extraSpace > 0) {
        extraPerSpace = extraSpace / spaceCount;
      }
    }
    const y = ctx.cursorY - opts.size;
    for (const tok of currentLine) {
      const isSpace = /^\s+$/.test(tok.text);
      ctx.page.drawText(tok.text, {
        x,
        y,
        size: opts.size,
        font: tok.font,
        color,
      });
      // Underline = thin line just below baseline.
      if (tok.underline && !isSpace) {
        ctx.page.drawLine({
          start: { x, y: y - 1.2 },
          end: { x: x + tok.widthPt, y: y - 1.2 },
          thickness: 0.6,
          color,
        });
      }
      x += tok.widthPt + (isSpace ? extraPerSpace : 0);
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
      flushLine(false);
    }
    currentLine.push(tok);
    currentWidth += tok.widthPt;
  }
  flushLine(true);
}

function ensureSpace(ctx: RenderCtx, needed: number): void {
  if (ctx.cursorY - needed < CONTENT_BOTTOM) {
    startNewPage(ctx);
  }
}
