"use client";

/**
 * Triggers Clerk's hosted profile modal. Lives in its own client
 * component so the surrounding /business-builder/settings/profile page can stay
 * a Server Component.
 */

import { UserProfile, useUser } from "@clerk/nextjs";
import { useState } from "react";
import { UserRound, X } from "lucide-react";

export function ProfileClerkButton() {
  const { isLoaded, user } = useUser();
  const [open, setOpen] = useState(false);

  if (!isLoaded || !user) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white opacity-50"
      >
        Loading…
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
      >
        <UserRound className="w-3.5 h-3.5" aria-hidden />
        Edit name, email, password
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit profile"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-md hover:bg-tbb-cream-50 text-tbb-ink-3 hover:text-tbb-navy"
              aria-label="Close profile editor"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
            <UserProfile routing="hash" />
          </div>
        </div>
      )}
    </>
  );
}
