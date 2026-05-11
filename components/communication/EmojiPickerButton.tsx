"use client";

/**
 * EmojiPickerButton — 😀 button that opens a searchable emoji grid.
 *
 * Lazy-imported so the ~250kb emoji-picker-react bundle doesn't block
 * the initial composer render. Closed-by-default; click outside or press
 * Escape to dismiss. Selecting an emoji calls `onSelect(glyph)` and
 * closes — the parent component decides where the glyph goes (insert
 * into the editor at cursor, or POST a reaction to the server).
 *
 * Used in two surfaces in 1.3.5:
 *   1. The composer toolbar — selection inserts the glyph into Tiptap
 *      via `RichTextEditorHandle.insertText`.
 *   2. The "+ reaction" hover menu's "Other" button — selection fires
 *      the addReaction server action.
 *
 * The brand colour palette is heritage-industrial; the picker's default
 * theme is reasonably neutral. We pin it to LIGHT mode so the cream
 * page background doesn't fight a dark picker chrome.
 */

import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { Smile } from "lucide-react";
import { Theme } from "emoji-picker-react";

// `emoji-picker-react` is a client-only bundle. Lazy-load it.
const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <div
      className="w-[320px] h-[400px] grid place-items-center bg-white border border-tbb-line rounded-pill font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground"
      role="status"
    >
      Loading emoji…
    </div>
  ),
});

type Anchor = "top" | "bottom";

export function EmojiPickerButton({
  onSelect,
  ariaLabel = "Insert emoji",
  triggerContent,
  triggerClassName,
  triggerProps,
  align = "right",
  anchor = "top",
}: {
  onSelect: (emoji: string) => void;
  ariaLabel?: string;
  /** Defaults to a smiley icon. Override for the reaction "+" trigger. */
  triggerContent?: ReactNode;
  triggerClassName?: string;
  triggerProps?: Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick" | "children" | "type" | "aria-label" | "aria-expanded"
  >;
  /** Horizontal popover alignment relative to the trigger. */
  align?: "left" | "right";
  /** Whether the popover floats above ("top") or below ("bottom") the trigger. */
  anchor?: Anchor;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        title={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={
          triggerClassName ??
          "p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-tbb-cream-50 transition-colors"
        }
        {...triggerProps}
      >
        {triggerContent ?? <Smile className="w-4 h-4" aria-hidden />}
      </button>
      {open && (
        <div
          className={
            "absolute z-50 " +
            (anchor === "top" ? "bottom-full mb-2 " : "top-full mt-2 ") +
            (align === "right" ? "right-0" : "left-0")
          }
        >
          <EmojiPicker
            onEmojiClick={(data) => {
              onSelect(data.emoji);
              setOpen(false);
            }}
            autoFocusSearch
            // Keep the picker compact on mobile.
            width={320}
            height={400}
            // Pin theme; brand uses Drafting Cream backgrounds, dark
            // chrome would fight that.
            theme={Theme.LIGHT}
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}
    </div>
  );
}
