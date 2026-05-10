"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { globalSearch, type GlobalSearchHit } from "@/lib/actions/global-search";

const TYPE_LABEL: Record<GlobalSearchHit["type"], string> = {
  action_item: "Action item",
  goal: "Goal",
  project: "Project",
  deliverable: "Deliverable",
  hire: "Candidate",
  document: "Document",
  session: "Session",
  message: "Message",
};

export function GlobalSearchPanel() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GlobalSearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!query.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await globalSearch({ query: query.trim() });
      if (!r.ok) setError(r.error);
      else setHits(r.data.hits);
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
          placeholder="Search by name, body, filename…"
          className="flex-1 bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
        />
        <button
          type="submit"
          disabled={isPending || !query.trim()}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50"
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
          className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
        >
          {error}
        </p>
      )}

      {hits !== null && (
        <section className="space-y-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {hits.length} result{hits.length === 1 ? "" : "s"}
          </h2>
          {hits.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground italic">
              No matches. Try a different keyword.
            </p>
          ) : (
            <ul className="divide-y divide-[#CCCCCC] border-t border-b border-[#CCCCCC]">
              {hits.map((h) => (
                <li key={`${h.type}-${h.id}`} className="py-2">
                  <Link href={h.href} className="block group">
                    <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {TYPE_LABEL[h.type]}
                      </span>
                      <span className="font-sans text-sm font-bold text-foreground group-hover:underline underline-offset-4">
                        {h.title}
                      </span>
                    </div>
                    {h.excerpt && (
                      <p className="mt-0.5 font-sans text-sm text-muted-foreground line-clamp-2">
                        {h.excerpt}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
