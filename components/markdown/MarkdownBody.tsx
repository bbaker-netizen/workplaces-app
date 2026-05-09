/**
 * MarkdownBody — safe markdown renderer for user-generated content.
 *
 * Server component. Used wherever we render text that the user typed:
 *   - message bodies in the Communication module (Phase 1.3)
 *   - action item descriptions in the detail / card views (1.3 also
 *     swaps in this renderer per the Phase-1-Plan.md note)
 *
 * Markdown features enabled:
 *   - GitHub-flavored markdown via remark-gfm: tables, strikethrough,
 *     task lists, autolinks.
 *   - Sanitization via rehype-sanitize with the default safe schema —
 *     raw HTML in user input is stripped, so an `<img onerror=…>` or a
 *     `<script>` tag can't reach the DOM. Important: every message body
 *     is multi-tenant UGC.
 *
 * The output is intentionally minimal — Tailwind utility classes apply
 * the brand typography (Work Sans body, IBM Plex Mono inline code, etc.)
 * without pulling in @tailwindcss/typography. Headings inside messages
 * are rendered smaller than page-level headings so a `# Heading` someone
 * types into a message doesn't dwarf the chrome.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export function MarkdownBody({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  return (
    <div
      className={
        "font-sans text-sm text-foreground leading-relaxed " +
        "[&>*+*]:mt-2 " +
        "[&_p]:my-0 " +
        "[&_strong]:font-bold " +
        "[&_em]:italic " +
        "[&_a]:text-[#2E4057] [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80 " +
        "[&_h1]:font-display [&_h1]:font-bold [&_h1]:text-base [&_h1]:tracking-tight " +
        "[&_h2]:font-display [&_h2]:font-bold [&_h2]:text-base [&_h2]:tracking-tight " +
        "[&_h3]:font-display [&_h3]:font-bold [&_h3]:text-sm [&_h3]:tracking-tight " +
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 " +
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 " +
        "[&_li]:pl-1 " +
        "[&_blockquote]:border-l-2 [&_blockquote]:border-[#CCCCCC] [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
        "[&_code]:font-mono [&_code]:text-[12px] [&_code]:bg-[#F5F1E8] [&_code]:border [&_code]:border-[#CCCCCC] [&_code]:rounded-sm [&_code]:px-1 " +
        "[&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:bg-[#F5F1E8] [&_pre]:border [&_pre]:border-[#CCCCCC] [&_pre]:rounded-sm [&_pre]:p-3 [&_pre]:overflow-x-auto " +
        "[&_pre>code]:bg-transparent [&_pre>code]:border-0 [&_pre>code]:p-0 " +
        "[&_table]:border-collapse [&_table]:text-sm " +
        "[&_th]:border [&_th]:border-[#CCCCCC] [&_th]:px-2 [&_th]:py-1 [&_th]:bg-[#F5F1E8] [&_th]:text-left " +
        "[&_td]:border [&_td]:border-[#CCCCCC] [&_td]:px-2 [&_td]:py-1 " +
        "[&_hr]:border-[#CCCCCC] [&_hr]:my-3 " +
        (className ?? "")
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
