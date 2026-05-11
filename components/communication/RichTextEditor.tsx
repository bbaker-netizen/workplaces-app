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
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { Markdown } from "tiptap-markdown";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Link2,
} from "lucide-react";
import {
  MentionList,
  type MentionListHandle,
  type MentionMember,
} from "./MentionList";

export type RichTextEditorHandle = {
  /** Returns the current markdown body (trimmed). */
  getMarkdown: () => string;
  /** Replaces the editor content with the provided markdown. */
  setMarkdown: (markdown: string) => void;
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
  placeholder = "Write a message…",
  disabled = false,
  autoFocus = false,
  onSubmit,
  onChange,
  editorRef,
  ariaLabel,
  members,
}: {
  initialMarkdown?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Called on ⌘/Ctrl + Enter. Receives the current markdown. */
  onSubmit?: (markdown: string) => void;
  /** Called on every change with the current markdown. */
  onChange?: (markdown: string) => void;
  /** Imperative handle; assigned via React ref-callback pattern. */
  editorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  ariaLabel?: string;
  /**
   * Engagement members for the @-mention typeahead. If omitted, the
   * mention extension is still installed (so old messages with mentions
   * render) but typing `@` produces no suggestions.
   */
  members?: MentionMember[];
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
        // Disable defaults we don't expose so the toolbar matches reality.
        heading: false,
        horizontalRule: false,
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
      Markdown.configure({
        html: false,
        breaks: false,
        linkify: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: initialMarkdown,
    autofocus: autoFocus,
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "prose-none w-full min-h-[72px] max-h-[40vh] overflow-y-auto " +
          "bg-white border border-tbb-line rounded-md px-3 py-2 " +
          "font-sans text-sm text-foreground " +
          "focus:outline-none focus:ring-2 focus:ring-tbb-blue focus:border-tbb-blue " +
          "disabled:bg-tbb-cream-50 disabled:cursor-wait",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
      handleKeyDown(_view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          const md = editor?.storage.markdown.getMarkdown() ?? "";
          onSubmitRef.current?.(md.trim());
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor: e }) {
      const md = e.storage.markdown.getMarkdown() ?? "";
      onChangeRef.current?.(md);
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
      <Toolbar editor={editor} disabled={disabled} />
      <EditorContent editor={editor} />
    </div>
  );
}

function makeHandle(editor: Editor | null): RichTextEditorHandle {
  return {
    getMarkdown() {
      return (editor?.storage.markdown.getMarkdown() ?? "").trim();
    },
    setMarkdown(markdown) {
      editor?.commands.setContent(markdown);
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
}: {
  editor: Editor | null;
  disabled: boolean;
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
