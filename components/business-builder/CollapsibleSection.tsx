"use client";

/**
 * Collapsible section — a toggle header that hides its children until
 * clicked. Used to tuck the archived-clients list out of the main
 * engagements view so it doesn't clutter the active client list.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
      >
        <ChevronDown
          aria-hidden
          className={"w-3.5 h-3.5 transition-transform " + (open ? "rotate-180" : "")}
        />
        {title}
      </button>
      {open && children}
    </section>
  );
}
