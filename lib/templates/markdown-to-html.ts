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
 * Append the user's email signature to the body. Markdown-aware — both
 * the body and the signature are markdown; we join with two blank lines
 * so they render as separate blocks.
 */
export function appendSignature(body: string, signature: string | null): string {
  const sig = (signature ?? "").trim();
  if (!sig) return body;
  return `${body.trimEnd()}\n\n${sig}`;
}
