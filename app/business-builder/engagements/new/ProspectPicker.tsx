"use client";

/**
 * Tiny client component for the "Start from a prospect" picker on
 * the New Engagement page. Lives in its own file so the page can
 * stay a Server Component.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";

export type EligibleProspect = {
  id: string;
  companyName: string;
  contactName: string | null;
  status: string;
};

export function ProspectPicker({
  prospects,
}: {
  prospects: EligibleProspect[];
}) {
  const router = useRouter();
  if (prospects.length === 0) return null;
  return (
    <div className="border border-tbb-cream-200 bg-tbb-cream-50 rounded-md px-4 py-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-tbb-blue shrink-0" aria-hidden />
        <p className="text-sm font-bold text-tbb-navy">
          Tip: start from a prospect to skip the typing
        </p>
      </div>
      <p className="text-xs text-tbb-ink-3 leading-snug">
        If this client is already in your pipeline, we&apos;ll auto-fill
        the name, contact, program, fee, and start date. Pick one below
        — or fill out the form from scratch.
      </p>
      <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-center">
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              router.push(
                "/business-builder/engagements/new?prospectId=" +
                  encodeURIComponent(e.target.value),
              );
            }
          }}
          className="bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        >
          <option value="">— Pick a prospect to pre-fill from —</option>
          {prospects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.companyName}
              {p.contactName ? ` · ${p.contactName}` : ""}
              {" · "}
              {p.status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <Link
          href="/business-builder/pipeline"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
        >
          Browse pipeline <ArrowRight className="w-3 h-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
