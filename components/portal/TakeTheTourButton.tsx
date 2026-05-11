"use client";

/**
 * Re-opens the WelcomeModal from anywhere. Clears the localStorage
 * "seen" flag so the modal renders again, then dispatches a custom
 * event the layout-level modal listens for to force-open.
 */

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { WelcomeModal } from "./WelcomeModal";

const STORAGE_KEY = "bbp-welcome-seen";

export function TakeTheTourButton({
  label = "Take the tour",
  variant = "primary",
}: {
  label?: string;
  variant?: "primary" | "ghost";
}) {
  const [open, setOpen] = useState(false);

  function start() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setOpen(true);
  }

  const className =
    variant === "ghost"
      ? "text-xs font-bold uppercase tracking-tbb-caps text-tbb-cream/75 hover:text-tbb-cream transition-colors duration-tbb-base"
      : "inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill border border-tbb-blue text-tbb-blue bg-white hover:bg-tbb-blue-100 transition-colors duration-tbb-base";

  return (
    <>
      <button type="button" onClick={start} className={className}>
        {variant === "primary" && (
          <HelpCircle className="w-4 h-4" aria-hidden />
        )}
        {label}
      </button>
      {open && (
        <WelcomeModal forceOpen onClose={() => setOpen(false)} />
      )}
    </>
  );
}
