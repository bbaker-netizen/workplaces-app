"use client";

/**
 * Replay the Coach workflow walkthrough on demand. Clears the
 * tour-seen flag, navigates to /business-builder if needed (the sidebar
 * anchors live there), and re-launches step 1.
 */

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { BusinessBuilderTour } from "./BusinessBuilderTour";

const STORAGE_KEY = "bbp-Coach-tour-seen";

export function TakeTheTourButton({
  label = "Run the interactive walkthrough",
}: {
  label?: string;
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
    if (!pathname.startsWith("/business-builder")) {
      router.push("/business-builder");
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 transition-colors duration-tbb-base shadow-tbb-cta"
      >
        <HelpCircle className="w-4 h-4" aria-hidden />
        {label}
      </button>
      {open && <BusinessBuilderTour forceOpen onClose={() => setOpen(false)} />}
    </>
  );
}
