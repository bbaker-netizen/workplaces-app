"use client";

/**
 * RichTextEditor — Tiptap WYSIWYG that produces Markdown.
 *
 * Phase 1.3.5 replacement for the plain `<textarea>` in the message
 * composer + inline edit drawer. Output is markdown so the existing
 * `MarkdownBody` renderer keeps working unchanged — every message read
 * path stays compatible with the body shape from 1.3.
 *
 * Why this stack:
 *   - `@tiptap/react` + `@tiptap/starter-kit` for the core (paragraphs,
 *     bold / italic / strike / code, headings, lists, blockquote,
 *     horizontal rule, history). Same library the HR app uses.
 *   - `tiptap-markdown` for in/out markdown serialization. Reading: we
 *     hydrate the editor from a markdown string when the user opens the
 *     edit drawer. Writing: `editor.storage.markdown.getMarkdown()`
 *     returns the string we hand to the server action.
 *   - `@tiptap/extension-link` separately because the StarterKit doesn't
 *     ship link by default.
 *   - `@tiptap/extension-placeholder` for the "Write a message…" hint
 *     since a contenteditable div can't use a native `placeholder` attr.
 *
 * Keyboard parity with 1.3:
 *   - Plain Enter inserts a paragraph break (Tiptap default).
 *   - ⌘/Ctrl + Enter → submit (`onSubmit` prop). Wrapped in a
 *     ProseMirror keymap plugin via `editorProps.handleKeyDown` so we
 *     don't fight Tiptap's own handlers.
 *
 * Styling matches the rendered MarkdownBody so the editing surface
 * looks like the eventual rendered surface.
 */

import { useEffect, useRef } from "react";
import { useEditor, EditorContent, ReactRenderer, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { Markdown } from "tiptap-markdown";
import {
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  Code,
  List,
  ListOrdered,
  Quote,
  Link2,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from "lucide-react";
import {
  MentionList,
  type MentionListHandle,
  type MentionMember,
} from "./MentionList";

export type RichTextEditorHandle = {
  /** Returns the current markdown body (trimmed). */
  getMarkdown: () => string;
  /** Returns the current HTML body (trimmed). Use this when richer
   *  formatting (alignment, underline, multiple blank lines) needs to
   *  round-trip losslessly — standard markdown can't express alignment
   *  and ProseMirror's markdown serializer collapses consecutive blank
   *  paragraphs, so HTML is the faithful format for signatures and
   *  document templates. */
  getHTML: () => string;
  /** Replaces the editor content with the provided markdown. */
  setMarkdown: (markdown: string) => void;
  /** Replaces the editor content with raw HTML. */
  setHTML: (html: string) => void;
  /** Inserts plain text (e.g. an emoji glyph) at the current cursor. */
  insertText: (text: string) => void;
  /** Clears the editor. */
  clear: () => void;
  /** Returns true if the document is empty (whitespace only). */
  isEmpty: () => boolean;
  /** Move focus into the editor. */
  focus: () => void;
  /** Collect all distinct user_profile ids referenced by `@mentions`. */
  getMentionIds: () => string[];
};

export function RichTextEditor({
  initialMarkdown = "",
  initialHtml,
  placeholder = "Write a message…",
  disabled = false,
  autoFocus = false,
  onSubmit,
  onChange,
  editorRef,
  ariaLabel,
  members,
  richMode = false,
  outputFormat = "markdown",
}: {
  /** Initial body in markdown form. Ignored if `initialHtml` is set. */
  initialMarkdown?: string;
  /** Initial body in HTML form. Use this for editors backed by HTML
   *  storage (signatures, document templates). When set, takes precedence
   *  over `initialMarkdown`. */
  initialHtml?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Called on ⌘/Ctrl + Enter. Receives the current value in the
   *  configured output format. */
  onSubmit?: (value: string) => void;
  /** Called on every change with the current value in the configured
   *  output format. */
  onChange?: (value: string) => void;
  /** Imperative handle; assigned via React ref-callback pattern. */
  editorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  ariaLabel?: string;
  /**
   * Engagement members for the @-mention typeahead. If omitted, the
   * mention extension is still installed (so old messages with mentions
   * render) but typing `@` produces no suggestions.
   */
  members?: MentionMember[];
  /** Turn on the richer toolbar: headings (H1/H2/H3), underline, text
   *  alignment (left / center / right / justify). Defaults to false so
   *  the message composer stays a simple markdown surface. */
  richMode?: boolean;
  /** What the onChange / getValue calls return. `"markdown"` for the
   *  message composer (lossy on whitespace/alignment), `"html"` for
   *  signatures + document templates where formatting needs to round-
   *  trip exactly. */
  outputFormat?: "markdown" | "html";
}) {
  // Hold the latest onSubmit / onChange / members so ProseMirror
  // handlers always see fresh closures without re-mounting the editor.
  const onSubmitRef = useRef(onSubmit);
  const onChangeRef = useRef(onChange);
  const membersRef = useRef<MentionMember[]>(members ?? []);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    membersRef.current = members ?? [];
  }, [members]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Headings: enable H1-H3 in rich mode (contracts, signatures);
        // off in the message composer to keep the toolbar simple.
        heading: richMode ? { levels: [1, 2, 3] } : false,
        horizontalRule: richMode ? {} : false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: {
          // Visual treatment for mentions in the editor surface.
          class:
            "mention text-tbb-navy font-bold rounded px-1 py-px bg-tbb-cream-50",
        },
        renderText({ options, node }) {
          // tiptap-markdown serializes inline nodes by reading this
          // value. So a Mention node becomes plain `@Label` in the
          // saved markdown — readable to anyone, even without the
          // editor. The user_profile_id flows separately via
          // `getMentionIds()`.
          return `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`;
        },
        suggestion: buildMentionSuggestion(membersRef),
      }),
      // Markdown extension: always installed so we can still emit
      // markdown when callers ask for it. In HTML mode it's harmless —
      // we just don't read from `editor.storage.markdown`. `html: true`
      // in richMode lets initial HTML content parse correctly.
      Markdown.configure({
        html: richMode,
        breaks: false,
        linkify: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      // Rich-mode-only extensions.
      ...(richMode
        ? [
            Underline,
            TextAlign.configure({
              // Apply alignment marks to these block-level nodes only.
              // We don't want alignment buttons setting alignment on
              // list items or quotes — clients then see nested chrome.
              types: ["heading", "paragraph"],
              alignments: ["left", "center", "right", "justify"],
              defaultAlignment: "left",
            }),
          ]
        : []),
    ],
    content: initialHtml ?? initialMarkdown,
    autofocus: autoFocus,
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          (richMode ? "tbb-rich-editor " : "") +
          "prose-none w-full min-h-[120px] max-h-[60vh] overflow-y-auto " +
          "bg-white border border-tbb-line rounded-md px-3 py-2 " +
          "font-sans text-sm text-foreground " +
          "focus:outline-none focus:ring-2 focus:ring-tbb-blue focus:border-tbb-blue " +
          "disabled:bg-tbb-cream-50 disabled:cursor-wait",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
      handleKeyDown(_view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          const value =
            outputFormat === "html"
              ? editor?.getHTML() ?? ""
              : editor?.storage.markdown.getMarkdown() ?? "";
          onSubmitRef.current?.(value.trim());
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor: e }) {
      const value =
        outputFormat === "html"
          ? e.getHTML() ?? ""
          : e.storage.markdown.getMarkdown() ?? "";
      onChangeRef.current?.(value);
    },
    immediatelyRender: false,
  });

  // Reflect `disabled` changes on remount-less updates.
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // Imperative handle — exposed via a ref the parent owns.
  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = makeHandle(editor);
    return () => {
      if (editorRef && editor === null) {
        editorRef.current = null;
      }
    };
  }, [editor, editorRef]);

  return (
    <div className={disabled ? "opacity-60" : ""} aria-disabled={disabled}>
      <Toolbar editor={editor} disabled={disabled} richMode={richMode} />
      <EditorContent editor={editor} />
    </div>
  );
}

function makeHandle(editor: Editor | null): RichTextEditorHandle {
  return {
    getMarkdown() {
      return (editor?.storage.markdown?.getMarkdown() ?? "").trim();
    },
    getHTML() {
      return (editor?.getHTML() ?? "").trim();
    },
    setMarkdown(markdown) {
      editor?.commands.setContent(markdown);
    },
    setHTML(html) {
      editor?.commands.setContent(html);
    },
    insertText(text) {
      editor?.chain().focus().insertContent(text).run();
    },
    clear() {
      editor?.commands.clearContent(true);
    },
    isEmpty() {
      return editor?.isEmpty ?? true;
    },
    focus() {
      editor?.commands.focus();
    },
    getMentionIds() {
      if (!editor) return [];
      const ids = new Set<string>();
      // Walk the doc; collect every Mention node's `id` attr.
      editor.state.doc.descendants((node) => {
        if (node.type.name === "mention") {
          const id = node.attrs.id;
          if (typeof id === "string" && id.length > 0) ids.add(id);
        }
        return true;
      });
      return Array.from(ids);
    },
  };
}

/* --------------------------- mention suggestion --------------------------- */

function buildMentionSuggestion(
  membersRef: React.MutableRefObject<MentionMember[]>,
) {
  return {
    char: "@",
    items({ query }: { query: string }) {
      const q = query.toLowerCase();
      return membersRef.current
        .filter((m) =>
          q ? m.label.toLowerCase().includes(q) : true,
        )
        .slice(0, 8);
    },
    render() {
      let component: ReactRenderer<MentionListHandle, {
        items: MentionMember[];
        command: (props: { id: string; label: string }) => void;
      }> | null = null;
      let popup: TippyInstance | null = null;

      return {
        onStart: (props: SuggestionProps<MentionMember>) => {
          component = new ReactRenderer(MentionList, {
            props: {
              items: props.items,
              command: props.command,
            },
            editor: props.editor,
          });
          if (!props.clientRect) return;
          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            arrow: false,
            theme: "light",
            // Tippy default offset works for this use case.
          })[0] ?? null;
        },
        onUpdate(props: SuggestionProps<MentionMember>) {
          if (!component) return;
          component.updateProps({
            items: props.items,
            command: props.command,
          });
          if (popup && props.clientRect) {
            popup.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
        },
        onKeyDown(props: SuggestionKeyDownProps) {
          if (props.event.key === "Escape") {
            popup?.hide();
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },
        onExit() {
          popup?.destroy();
          popup = null;
          component?.destroy();
          component = null;
        },
      };
    },
  };
}

/* ------------------------------- toolbar ------------------------------- */

function Toolbar({
  editor,
  disabled,
  richMode,
}: {
  editor: Editor | null;
  disabled: boolean;
  richMode: boolean;
}) {
  if (!editor) {
    // Reserve the toolbar's vertical space so the composer height
    // doesn't jump on hydration.
    return <div className="h-9 mb-1" aria-hidden />;
  }
  const btnClass =
    "p-1.5 rounded hover:bg-tbb-cream-50 disabled:opacity-40 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors";
  const activeClass = "bg-tbb-cream-50 text-foreground";

  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs);

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 mb-1 pb-1 border-b border-tbb-line"
    >
      {richMode && (
        <>
          <ToolbarButton
            label="Heading 1"
            ariaPressed={isActive("heading", { level: 1 })}
            disabled={disabled}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            className={`${btnClass} ${
              isActive("heading", { level: 1 }) ? activeClass : ""
            }`}
          >
            <Heading1 className="w-4 h-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 2"
            ariaPressed={isActive("heading", { level: 2 })}
            disabled={disabled}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className={`${btnClass} ${
              isActive("heading", { level: 2 }) ? activeClass : ""
            }`}
          >
            <Heading2 className="w-4 h-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 3"
            ariaPressed={isActive("heading", { level: 3 })}
            disabled={disabled}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            className={`${btnClass} ${
              isActive("heading", { level: 3 }) ? activeClass : ""
            }`}
          >
            <Heading3 className="w-4 h-4" aria-hidden />
          </ToolbarButton>
          <span className="w-px h-5 bg-tbb-line mx-1" aria-hidden />
        </>
      )}
      <ToolbarButton
        label="Bold"
        ariaPressed={isActive("bold")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`${btnClass} ${isActive("bold") ? activeClass : ""}`}
      >
        <Bold className="w-4 h-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        ariaPressed={isActive("italic")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${btnClass} ${isActive("italic") ? activeClass : ""}`}
      >
        <Italic className="w-4 h-4" aria-hidden />
      </ToolbarButton>
      {richMode && (
        <ToolbarButton
          label="Underline"
          ariaPressed={isActive("underline")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${btnClass} ${isActive("underline") ? activeClass : ""}`}
        >
          <UnderlineIcon className="w-4 h-4" aria-hidden />
        </ToolbarButton>
      )}
      <ToolbarButton
        label="Strikethrough"
        ariaPressed={isActive("strike")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`${btnClass} ${isActive("strike") ? activeClass : ""}`}
      >
        <Strikethrough className="w-4 h-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        ariaPressed={isActive("code")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`${btnClass} ${isActive("code") ? activeClass : ""}`}
      >
        <Code className="w-4 h-4" aria-hidden />
      </ToolbarButton>
      <span className="w-px h-5 bg-tbb-line mx-1" aria-hidden />
      <ToolbarButton
        label="Bulleted list"
        ariaPressed={isActive("bulletList")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`${btnClass} ${isActive("bulletList") ? activeClass : ""}`}
      >
        <List className="w-4 h-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        ariaPressed={isActive("orderedList")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`${btnClass} ${isActive("orderedList") ? activeClass : ""}`}
      >
        <ListOrdered className="w-4 h-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Blockquote"
        ariaPressed={isActive("blockquote")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`${btnClass} ${isActive("blockquote") ? activeClass : ""}`}
      >
        <Quote className="w-4 h-4" aria-hidden />
      </ToolbarButton>
      {richMode && (
        <>
          <span className="w-px h-5 bg-tbb-line mx-1" aria-hidden />
          <ToolbarButton
            label="Align left"
            ariaPressed={editor.isActive("paragraph", { textAlign: "left" }) || editor.isActive("heading", { textAlign: "left" })}
            disabled={disabled}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={`${btnClass} ${
              editor.isActive("paragraph", { textAlign: "left" }) || editor.isActive("heading", { textAlign: "left" }) ? activeClass : ""
            }`}
          >
            <AlignLeft className="w-4 h-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Align center"
            ariaPressed={editor.isActive("paragraph", { textAlign: "center" }) || editor.isActive("heading", { textAlign: "center" })}
            disabled={disabled}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={`${btnClass} ${
              editor.isActive("paragraph", { textAlign: "center" }) || editor.isActive("heading", { textAlign: "center" }) ? activeClass : ""
            }`}
          >
            <AlignCenter className="w-4 h-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Align right"
            ariaPressed={editor.isActive("paragraph", { textAlign: "right" }) || editor.isActive("heading", { textAlign: "right" })}
            disabled={disabled}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={`${btnClass} ${
              editor.isActive("paragraph", { textAlign: "right" }) || editor.isActive("heading", { textAlign: "right" }) ? activeClass : ""
            }`}
          >
            <AlignRight className="w-4 h-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Justify"
            ariaPressed={editor.isActive("paragraph", { textAlign: "justify" }) || editor.isActive("heading", { textAlign: "justify" })}
            disabled={disabled}
            onClick={() =>
              editor.chain().focus().setTextAlign("justify").run()
            }
            className={`${btnClass} ${
              editor.isActive("paragraph", { textAlign: "justify" }) || editor.isActive("heading", { textAlign: "justify" }) ? activeClass : ""
            }`}
          >
            <AlignJustify className="w-4 h-4" aria-hidden />
          </ToolbarButton>
        </>
      )}
      <span className="w-px h-5 bg-tbb-line mx-1" aria-hidden />
      <ToolbarButton
        label={isActive("link") ? "Edit link" : "Insert link"}
        ariaPressed={isActive("link")}
        disabled={disabled}
        onClick={() => promptAndToggleLink(editor)}
        className={`${btnClass} ${isActive("link") ? activeClass : ""}`}
      >
        <Link2 className="w-4 h-4" aria-hidden />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  label,
  ariaPressed,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string;
  ariaPressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={ariaPressed}
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  );
}

function promptAndToggleLink(editor: Editor) {
  const previous = editor.getAttributes("link").href as string | undefined;
  const next = window.prompt("Link URL", previous ?? "https://");
  if (next === null) return;
  if (next === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  // Block javascript: / data: / vbscript: schemes — sanitization on the
  // render side strips these too, but no point storing them.
  if (/^(javascript|data|vbscript):/i.test(next.trim())) return;
  editor
    .chain()
    .focus()
    .extendMarkRange("link")
    .setLink({ href: next.trim() })
    .run();
}
