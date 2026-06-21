"use client";

/**
 * Ask-your-meetings search box for the client portal Meeting notes page.
 * Sends a natural-language question to Claude, which answers from the
 * client's own synced recaps (searchClientMeetings server action).
 */

import { useState, useTransition } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { searchClientMeetings } from "@/lib/actions/search-meetings";

const SUGGESTIONS = [
  "What did we decide about hiring?",
  "Summarize our last session",
  "What action items came out of marketing?",
];

export function MeetingSearch() {
  const [q, setQ] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function ask(question?: string) {
    const text = (question ?? q).trim();
    if (!text) return;
    if (question) setQ(question);
    setError(null);
    setReply(null);
    start(async () => {
      const r = await searchClientMeetings(text);
      if (!r.ok) setError(r.error);
      else setReply(r.reply);
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 shadow-tbb-xs space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-tbb-blue" aria-hidden />
        <h2 className="font-bold text-tbb-navy text-lg tracking-tight">
          Ask your meetings
        </h2>
      </div>
      <p className="text-sm text-tbb-ink-3">
        Search across every recorded session — ask a question and get an answer
        pulled from your meeting notes.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={isPending}
          placeholder="e.g. What did we agree on for pricing?"
          className="flex-1 bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
        <button
          type="submit"
          disabled={isPending || q.trim().length === 0}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <Search className="w-3.5 h-3.5" aria-hidden />
          )}
          Ask
        </button>
      </form>

      {!reply && !error && !isPending && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="text-[11px] text-tbb-ink-3 border border-tbb-line rounded-pill px-2.5 py-1 hover:border-tbb-blue hover:text-tbb-blue"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50">
          {error}
        </p>
      )}
      {reply && (
        <div className="border-t border-tbb-line-soft pt-3 text-sm text-tbb-ink-2 leading-relaxed whitespace-pre-wrap">
          {reply}
        </div>
      )}
    </section>
  );
}
