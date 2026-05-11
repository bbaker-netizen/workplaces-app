"use client";

/**
 * Re-trigger the interactive PortalTour from anywhere. Clears the
 * tour-seen flag so the spotlight overlay starts again from step 1.
 *
 * Used in the portal footer ("Take the tour") and on the
 * /portal/welcome guide page ("Replay the quick tour").
 */

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { PortalTour } from "./PortalTour";

const STORAGE_KEY = "bbp-tour-seen";

export function TakeTheTourButton({
  label = "Take the tour",
  variant = "primary",
}: {
  label?: string;
  variant?: "primary" | "ghost";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function start() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    // The tour anchors are on /portal. If user is elsewhere, take
    // them there first; the layout-level PortalTour will pick the
    // flag up automatically.
    if (pathname !== "/portal") {
      router.push("/portal");
      return;
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
        <PortalTour forceOpen onClose={() => setOpen(false)} />
      )}
    </>
  );
}
