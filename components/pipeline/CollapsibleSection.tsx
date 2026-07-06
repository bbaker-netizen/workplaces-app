"use client";

/**
 * CollapsibleSection — a drawer that owns the card chrome (border, title
 * bar, chevron) and shows/hides its body on click. The reference pattern
 * for calming down dense detail pages via progressive disclosure: the page
 * keeps a small always-visible core and tucks secondary sections in here.
 *
 * Behaviour:
 *   - `defaultOpen` sets the initial state (used for stage-aware auto-open —
 *     e.g. Quick actions opens for a fresh lead).
 *   - Once the user toggles it, the choice is remembered PER PERSON across
 *     leads (localStorage, keyed by `storageKey`), so each Business Builder
 *     settles into their own layout.
 *   - The body stays mounted but hidden when closed, so in-progress edits
 *     (an unsent comment, a half-typed note) survive a collapse.
 *
 * The remembered value is read in an effect after mount, so server and
 * first client render both use `defaultOpen` — no hydration mismatch.
 */

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({
  title,
  icon,
  badge,
  defaultOpen = false,
  storageKey,
  children,
}: {
  title: string;
  /** Small leading icon element (e.g. <StickyNote className="w-3.5 h-3.5" />). */
  icon?: React.ReactNode;
  /** Right-aligned hint in the header — a count, a status, etc. */
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  /** Stable, section-level key. Preference persists across prospects. */
  storageKey: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(`tbb.drawer.${storageKey}`);
      if (v === "1") setOpen(true);
      else if (v === "0") setOpen(false);
    } catch {
      /* localStorage unavailable (private mode) — fall back to defaultOpen */
    }
  }, [storageKey]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          `tbb.drawer.${storageKey}`,
          next ? "1" : "0",
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const panelId = `drawer-${storageKey}`;

  return (
    <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-tbb-cream-50 rounded-lg"
      >
        <ChevronDown
          className={
            "w-4 h-4 flex-none text-tbb-ink-3 transition-transform duration-tbb-base " +
            (open ? "rotate-0" : "-rotate-90")
          }
          aria-hidden
        />
        {icon && (
          <span className="text-tbb-ink-3 flex-none inline-flex">{icon}</span>
        )}
        <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          {title}
        </span>
        {badge != null && (
          <span className="ml-auto text-[11px] text-tbb-ink-3 tabular-nums">
            {badge}
          </span>
        )}
      </button>
      <div id={panelId} hidden={!open} className="border-t border-tbb-line-soft">
        {children}
      </div>
    </section>
  );
}
