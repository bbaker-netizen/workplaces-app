"use client";

/**
 * Active-engagements list with an instant search box — filter by company
 * (engagement) name OR the client contact's name, so you can find a client
 * by the person you deal with, not just the business name.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, Search } from "lucide-react";
import { EngagementArchiveButton } from "@/components/business-builder/EngagementArchiveButton";

export type EngagementRow = {
  id: string;
  name: string;
  orgName: string | null;
  contactName: string | null;
  status: string;
  program: string; // "Accelerator" | "Implementer"
};

export function EngagementSearchList({ rows }: { rows: EngagementRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.orgName, r.contactName]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [rows, q]);

  return (
    <div className="space-y-3">
      <label className="relative block max-w-md">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tbb-ink-3"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by company or contact name…"
          className="w-full bg-white border border-tbb-line rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
      </label>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-tbb-line rounded-lg bg-white px-6 py-8 text-center">
          <p className="text-sm text-tbb-ink-3">
            No clients match &ldquo;{query}&rdquo;.
          </p>
        </div>
      ) : (
        <ul className="border border-tbb-line rounded-lg bg-white divide-y divide-tbb-line-soft overflow-hidden shadow-tbb-sm">
          {filtered.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 px-5 py-4 hover:bg-tbb-cream-50 transition-colors"
            >
              <Link
                href={`/business-builder/engagements/${e.id}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-tbb-navy">
                    {e.name || e.orgName || "Untitled engagement"}
                  </span>
                  <span className="block text-xs text-tbb-ink-3 mt-0.5">
                    {e.contactName || "—"}
                    {e.status !== "active" && (
                      <>
                        {" "}
                        · <span className="capitalize">{e.status}</span>
                      </>
                    )}
                  </span>
                </span>
                <ArrowRight
                  className="w-4 h-4 text-tbb-ink-3 shrink-0"
                  aria-hidden
                />
              </Link>
              <span
                className="shrink-0 inline-flex items-center text-[10px] font-bold uppercase tracking-tbb-caps px-2.5 py-1.5 rounded-pill bg-tbb-cream-100 text-tbb-ink-2 capitalize"
                title="The program this client is signed up for (set at conversion)"
              >
                {e.program}
              </span>
              <a
                href={`/portal/e/${e.id}`}
                title="See this client's portal exactly as they see it"
                className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tbb-caps px-2.5 py-1.5 rounded-pill border border-tbb-line text-tbb-blue hover:border-tbb-blue hover:bg-white transition-colors"
              >
                <Eye className="w-3 h-3" aria-hidden /> View portal
              </a>
              <EngagementArchiveButton
                engagementId={e.id}
                engagementName={e.name || e.orgName || "this client"}
                archived={false}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
