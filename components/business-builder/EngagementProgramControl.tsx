"use client";

/**
 * Program switcher for an engagement — Accelerator / Implementer. Writing
 * here updates the engagement AND the originating Pipeline lead, so every
 * surface (Engagements list, Client Portal list, Pipeline) agrees.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  setEngagementProgram,
  type EngagementProgram,
} from "@/lib/actions/engagements";

export function EngagementProgramControl({
  engagementId,
  current,
}: {
  engagementId: string;
  current: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<EngagementProgram>(
    current === "implementer" ? "implementer" : "accelerator",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function change(next: EngagementProgram) {
    const prev = value;
    setValue(next);
    setError(null);
    start(async () => {
      const r = await setEngagementProgram(engagementId, next);
      if (!r.ok) {
        setValue(prev);
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {isPending && (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-tbb-ink-3" aria-hidden />
      )}
      <select
        value={value}
        onChange={(e) => change(e.target.value as EngagementProgram)}
        disabled={isPending}
        title="The program this client is signed up for"
        className="text-xs font-bold uppercase tracking-tbb-caps bg-white border border-tbb-line rounded-pill px-3 py-1.5 text-tbb-navy cursor-pointer focus:outline-none focus:ring-2 focus:ring-tbb-blue disabled:opacity-50"
      >
        <option value="accelerator">Accelerator</option>
        <option value="implementer">Implementer</option>
      </select>
      {error && <span className="text-[11px] text-tbb-danger">{error}</span>}
    </span>
  );
}
