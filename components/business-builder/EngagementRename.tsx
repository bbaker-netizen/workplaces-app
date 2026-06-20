"use client";

/**
 * Inline rename for a client/engagement. The engagement name is the
 * client's portal branding, so this lets the coach fix a name that ended
 * up as a person's first name (e.g. "Amardeep") instead of the business.
 * Renders the H1; a pencil flips it into an input. Saves to
 * renameEngagement, which updates the engagement + org + originating lead.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { renameEngagement } from "@/lib/actions/engagements";

export function EngagementRename({
  engagementId,
  name,
}: {
  engagementId: string;
  name: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function save() {
    const next = value.trim();
    if (next === name) {
      setEditing(false);
      return;
    }
    setError(null);
    start(async () => {
      const r = await renameEngagement(engagementId, next);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight inline-flex items-center gap-2 group">
        {name}
        <button
          type="button"
          onClick={() => {
            setValue(name);
            setError(null);
            setEditing(true);
          }}
          title="Rename this client"
          aria-label="Rename this client"
          className="opacity-40 group-hover:opacity-100 text-tbb-ink-3 hover:text-tbb-blue transition-opacity"
        >
          <Pencil className="w-4 h-4" aria-hidden />
        </button>
      </h1>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          disabled={isPending}
          placeholder="Business name"
          className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight bg-white border-b-2 border-tbb-blue focus:outline-none px-1 min-w-0 w-full max-w-md"
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          title="Save"
          aria-label="Save name"
          className="shrink-0 p-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <Check className="w-4 h-4" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={isPending}
          title="Cancel"
          aria-label="Cancel rename"
          className="shrink-0 p-1.5 rounded-pill border border-tbb-line text-tbb-ink-3 hover:text-tbb-navy"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
      <p className="text-[11px] text-tbb-ink-3">
        This is the client&apos;s portal name. Updates the Engagements list and
        Pipeline too.
      </p>
      {error && <p className="text-xs text-tbb-danger">{error}</p>}
    </div>
  );
}
