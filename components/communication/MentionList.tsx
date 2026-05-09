"use client";

/**
 * MentionList — keyboard-navigable popover for the @ typeahead.
 *
 * Rendered by the Tiptap mention extension's `suggestion.render`
 * callback. Typing `@bru` filters the list down to matches; ↑/↓ moves
 * the highlight, Enter or Tab confirms, Escape cancels.
 *
 * Pure presentation + selection — the parent (the suggestion plugin)
 * owns the data and the insertion. We only call `onSelect(member)`
 * with the chosen entry.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

export type MentionMember = {
  id: string;
  label: string;
  email?: string;
};

export type MentionListHandle = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

export const MentionList = forwardRef<
  MentionListHandle,
  {
    items: MentionMember[];
    command: (props: { id: string; label: string }) => void;
  }
>(function MentionList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset highlight whenever the filtered set changes.
  useEffect(() => setSelectedIndex(0), [items]);

  const select = (index: number) => {
    const item = items[index];
    if (!item) return;
    command({ id: item.id, label: item.label });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) =>
          (i + Math.max(items.length, 1) - 1) % Math.max(items.length, 1),
        );
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        select(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-[#CCCCCC] bg-white shadow-md px-3 py-2 font-sans text-sm text-muted-foreground">
        No members match.
      </div>
    );
  }

  return (
    <ul
      role="listbox"
      className="max-h-64 overflow-y-auto rounded-md border border-[#CCCCCC] bg-white shadow-md py-1 min-w-[220px]"
    >
      {items.map((item, idx) => (
        <li key={item.id} role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={idx === selectedIndex}
            onMouseEnter={() => setSelectedIndex(idx)}
            onClick={() => select(idx)}
            className={
              "w-full text-left px-3 py-1.5 font-sans text-sm transition-colors " +
              (idx === selectedIndex
                ? "bg-[#F5F1E8] text-foreground"
                : "text-foreground hover:bg-[#F5F1E8]")
            }
          >
            <span className="font-bold">@{item.label}</span>
            {item.email && (
              <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                {item.email}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
});
