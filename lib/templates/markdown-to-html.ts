/**
 * Server-side markdown → safe HTML converter for outbound email bodies
 * (templates + manual sends + auto-fired onboarding emails).
 *
 * Why we don't pull in marked / unified / remark-rehype: the markdown
 * Tiptap produces is a tiny well-defined subset, the conversion runs in
 * a server action on every email send, and we want predictable HTML
 * Gmail won't strip. A 100-line focused parser is more reliable than
 * dragging in a 200kb parser tree just to render bold + lists + links.
 *
 * Inline patterns supported:
 *   - **bold** / __bold__
 *   - *italic* / _italic_
 *   - ~~strike~~
 *   - `inline code`
 *   - [text](url) — http(s)/mailto only; other schemes are rendered as text
 *   - bare URLs and @mentions are passed through as plain text
 *
 * Block patterns supported:
 *   - Paragraphs separated by blank lines
 *   - `> ` blockquotes (can wrap multiple consecutive lines)
 *   - `- ` / `* ` bulleted lists
 *   - `1. ` numbered lists
 *
 * Everything else falls through as a paragraph. Headings are intentionally
 * not exposed in the toolbar so the editor doesn't produce them.
 */

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]!);
}

const SAFE_LINK_SCHEME = /^(?:https?:\/\/|mailto:|tel:)/i;

/** Inline transforms applied AFTER block parsing. Operates on escaped HTML. */
function inline(escaped: string): string {
  // Links — done before * / _ so link labels don't get mangled.
  let out = escaped.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, href: string) => {
      const trimmed = href.trim();
      if (!SAFE_LINK_SCHEME.test(trimmed)) return label;
      return `<a href="${escapeHtml(trimmed)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
  );

  // Inline code — single backticks (no triple-backtick code blocks since
  // the editor doesn't expose them).
  out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Bold (**…** or __…__).
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");

  // Italic (*…* or _…_). Run after bold so the bold sentinels are gone.
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

  // Strikethrough.
  out = out.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");

  return out;
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

/** Parse the source into top-level blocks. Whitespace separates them. */
function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", lines: buf });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    // Paragraph — consume until blank line or a new block trigger.
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "p", lines: buf });
  }
  return blocks;
}

function renderBlock(b: Block): string {
  if (b.kind === "p") {
    const inner = b.lines.map((l) => inline(escapeHtml(l))).join("<br>");
    return `<p>${inner}</p>`;
  }
  if (b.kind === "quote") {
    const inner = b.lines.map((l) => inline(escapeHtml(l))).join("<br>");
    return `<blockquote>${inner}</blockquote>`;
  }
  if (b.kind === "ul") {
    const items = b.items
      .map((it) => `<li>${inline(escapeHtml(it))}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }
  // ol
  const items = b.items
    .map((it) => `<li>${inline(escapeHtml(it))}</li>`)
    .join("");
  return `<ol>${items}</ol>`;
}

/**
 * Convert markdown to inline-styled HTML safe for Gmail / Outlook /
 * Apple Mail. Inline styles instead of a stylesheet because most email
 * clients strip `<style>` tags.
 */
export function markdownToEmailHtml(md: string): string {
  if (!md || !md.trim()) return "";
  const blocks = parseBlocks(md);
  const body = blocks.map(renderBlock).join("\n");

  // Wrap in a minimal HTML document with email-safe inline styles. We
  // intentionally keep this stylesheet small — many clients downgrade or
  // strip <style>, so we re-apply the critical bits inline below in the
  // post-processing step.
  return wrapInEmailDocument(body);
}

function wrapInEmailDocument(body: string): string {
  // Inline-style the elements that matter most for Gmail rendering.
  const styled = body
    .replace(
      /<p>/g,
      '<p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1A1A1A;">',
    )
    .replace(
      /<blockquote>/g,
      '<blockquote style="margin:0 0 12px 0;padding:8px 14px;border-left:3px solid #2E4057;background:#F5F1E8;color:#1A1A1A;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">',
    )
    .replace(
      /<ul>/g,
      '<ul style="margin:0 0 12px 0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1A1A1A;">',
    )
    .replace(
      /<ol>/g,
      '<ol style="margin:0 0 12px 0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1A1A1A;">',
    )
    .replace(/<li>/g, '<li style="margin:0 0 4px 0;">')
    .replace(
      /<a /g,
      '<a style="color:#2E4057;text-decoration:underline;" ',
    )
    .replace(
      /<code>/g,
      '<code style="font-family:Menlo,Consolas,monospace;font-size:13px;background:#F5F1E8;padding:1px 4px;border-radius:3px;">',
    )
    .replace(/<strong>/g, '<strong style="font-weight:700;">')
    .replace(/<em>/g, '<em style="font-style:italic;">');

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff;">${styled}</body></html>`;
}

/**
 * Append the user's email signature to the body.
 *
 * The signature can be either markdown (legacy — written before the
 * signature editor switched to HTML output) or HTML (new — preserves
 * spacing, alignment, underline, blank lines).
 *
 * For the plain-text body (what we hand to Gmail's text/plain part)
 * we strip HTML tags out of the signature on the fly so the recipient's
 * text-only client doesn't see `<p>` literals.
 *
 * For the HTML body (text/html part) the signature is concatenated
 * after running the body through `markdownToEmailHtml`. If the sig
 * itself is HTML, we use it directly. If it's markdown, we run it
 * through the same converter.
 */
export function appendSignature(body: string, signature: string | null): string {
  const sig = (signature ?? "").trim();
  if (!sig) return body;
  // Body is markdown. If the signature is HTML, strip the tags for
  // the plain-text body. The HTML build path uses `buildHtmlBodyWithSignature`
  // below instead, which keeps the HTML structure intact.
  const sigPlain = looksLikeHtml(sig) ? stripHtmlForPlainText(sig) : sig;
  return `${body.trimEnd()}\n\n${sigPlain}`;
}

/**
 * Render the markdown body + signature into an HTML document suitable
 * for Gmail. Used when the signature is HTML and we want to preserve
 * its layout faithfully (alignment, blank lines, underline).
 */
export function buildHtmlBodyWithSignature(
  bodyMarkdown: string,
  signature: string | null,
): string {
  const sig = (signature ?? "").trim();
  if (!sig) return markdownToEmailHtml(bodyMarkdown);
  const sigHtml = looksLikeHtml(sig)
    ? styleSignatureHtml(sig)
    : // Legacy markdown signature — run through the same converter as
      // the body so the visual treatment lines up.
      extractBodyFromEmailDoc(markdownToEmailHtml(sig));
  // Render the body as a full email doc, then splice the styled sig
  // in just before the closing </body>.
  const bodyDoc = markdownToEmailHtml(bodyMarkdown);
  const SIG_SEPARATOR = `<div style="margin:18px 0 0 0;padding-top:14px;border-top:1px solid #E5E5E5;"></div>`;
  return bodyDoc.replace(
    /<\/body>\s*<\/html>$/,
    `${SIG_SEPARATOR}${sigHtml}</body></html>`,
  );
}

function looksLikeHtml(s: string): boolean {
  return s.trim().startsWith("<");
}

/** Pull body innerHTML out of `<!DOCTYPE html><html><body>…</body></html>`. */
function extractBodyFromEmailDoc(fullDoc: string): string {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(fullDoc);
  return m ? m[1] : fullDoc;
}

/**
 * Re-style HTML emitted by the signature editor (Tiptap) for email
 * clients. Email clients strip <style> tags so every block-level
 * element needs inline styles. We map the editor's tags to the same
 * inline styles `wrapInEmailDocument` uses for the body.
 */
function styleSignatureHtml(html: string): string {
  return (
    html
      .replace(
        /<p(\s+style="([^"]*)")?>/g,
        (_m, _attr, existing) => {
          // Preserve any inline alignment / spacing from the editor.
          const extra = existing ? `${existing};` : "";
          return `<p style="${extra}margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1A1A1A;">`;
        },
      )
      .replace(/<p[^>]*style="([^"]*)"[^>]*>/g, (m) => m) // already styled
      .replace(/<h1>/g, '<h1 style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#2E4057;">')
      .replace(/<h2>/g, '<h2 style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:#2E4057;">')
      .replace(/<h3>/g, '<h3 style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#2E4057;">')
      .replace(/<ul>/g, '<ul style="margin:0 0 8px 0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1A1A1A;">')
      .replace(/<ol>/g, '<ol style="margin:0 0 8px 0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1A1A1A;">')
      .replace(/<li>/g, '<li style="margin:0 0 2px 0;">')
      .replace(/<blockquote>/g, '<blockquote style="margin:8px 0;padding:6px 12px;border-left:3px solid #2E4057;background:#F5F1E8;color:#1A1A1A;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">')
      .replace(/<a /g, '<a style="color:#2E4057;text-decoration:underline;" ')
      .replace(/<strong>/g, '<strong style="font-weight:700;">')
      .replace(/<em>/g, '<em style="font-style:italic;">')
      .replace(/<u>/g, '<u style="text-decoration:underline;">')
  );
}

/**
 * Strip HTML tags for the plain-text email body. Preserves paragraph
 * breaks as newlines, list bullets as `- `, and link URLs in parens.
 * Not bulletproof against arbitrary HTML — but the only HTML we ever
 * accept here is what Tiptap emits, which is a small known set.
 */
function stripHtmlForPlainText(html: string): string {
  return (
    html
      // Block-level elements → newlines
      .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|blockquote)>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      // Inline → drop tags but keep content
      .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
      .replace(/<[^>]+>/g, "")
      // Decode the small set of entities we emit
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
