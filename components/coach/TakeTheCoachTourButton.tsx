"use client";

/**
 * Replay the coach workflow walkthrough on demand. Clears the
 * tour-seen flag, navigates to /coach if needed (the sidebar
 * anchors live there), and re-launches step 1.
 */

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { CoachTour } from "./CoachTour";

const STORAGE_KEY = "bbp-coach-tour-seen";

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
    if (!pathname.startsWith("/coach")) {
      router.push("/coach");
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
      {open && <CoachTour forceOpen onClose={() => setOpen(false)} />}
    </>
  );
}
