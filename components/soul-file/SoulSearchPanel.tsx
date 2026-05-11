"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { searchSoulFiles } from "@/lib/actions/soul-files";

type Result = {
  engagementId: string;
  engagementName: string | null;
  snippet: string;
  distance: number;
};

export function SoulSearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!query.trim()) return;
    setError(null);
    setResults(null);
    startTransition(async () => {
      const r = await searchSoulFiles(query.trim(), 10);
      if (!r.ok) setError(r.error);
      else setResults(r.data);
    });
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isPending}
          placeholder="Which client is wrestling with succession?…"
          className="flex-1 bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
        <button
          type="submit"
          disabled={isPending || !query.trim()}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" aria-hidden />
          )}
          Search
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}

      {results !== null && (
        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            {results.length} result{results.length === 1 ? "" : "s"}
          </h2>
          {results.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground italic">
              No matches. Try a different angle, or check that the Soul Files for your engagements have content (empty Soul Files don&apos;t embed).
            </p>
          ) : (
            <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
              {results.map((r) => (
                <li key={r.engagementId} className="py-3 space-y-1">
                  <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                    <Link
                      href={`/coach/soul-file/${r.engagementId}`}
                      className="font-bold text-foreground text-base tracking-tight hover:underline underline-offset-4"
                    >
                      {r.engagementName ?? "Engagement"}
                    </Link>
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                      similarity {(1 - r.distance).toFixed(2)}
                    </span>
                  </div>
                  <p className="font-sans text-sm text-muted-foreground line-clamp-3">
                    {r.snippet}…
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
