"use client";

/**
 * SoulFileInsights — the AI panel that lives next to the Soul File
 * body. Two parts:
 *
 *   1. "Extract from session" form — Bruce picks a recent BBS session
 *      (or pastes raw text), hits Extract, Claude proposes
 *      Soul-File-worthy observations.
 *   2. Pending insights list — each card has Accept (merges into the
 *      Soul File body with a date stamp) or Dismiss.
 *
 * Bruce's notes are always in the existing SoulFileEditor body and
 * are clearly differentiated from AI-extracted observations via a
 * `--- AI insight, DATE:` separator added on accept.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import {
  acceptSoulFileInsight,
  dismissSoulFileInsight,
  extractSoulFileInsights,
} from "@/lib/actions/soul-file-insights";

export type PendingInsight = {
  id: string;
  body: string;
  createdAt: Date;
};

export type SessionOption = {
  id: string;
  label: string;
};

export function SoulFileInsights({
  engagementId,
  pending,
  sessionOptions,
}: {
  engagementId: string;
  pending: PendingInsight[];
  sessionOptions: SessionOption[];
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>(
    sessionOptions[0]?.id ?? "",
  );
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runExtract() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await extractSoulFileInsights({
        engagementId,
        sessionId: sessionId || undefined,
        rawText: rawText.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.created === 0) {
        setSuccess(
          "Claude read it but didn't find anything Soul-File-worthy this time.",
        );
      } else {
        setSuccess(
          `🪶 Claude proposed ${r.created} insight${r.created === 1 ? "" : "s"} — review them below.`,
        );
        setRawText("");
      }
      router.refresh();
    });
  }

  function accept(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await acceptSoulFileInsight(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function dismiss(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await dismissSoulFileInsight(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="border border-tbb-blue/30 rounded-lg bg-gradient-to-br from-tbb-blue-100 via-white to-tbb-cream-50 p-5 space-y-4 shadow-tbb-sm">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-full bg-tbb-blue text-white shrink-0">
          <Sparkles className="w-4 h-4" aria-hidden />
        </span>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue-700">
            AI insights
          </p>
          <h2 className="text-base font-bold text-tbb-navy">
            Pull Soul-File-worthy observations from a session
          </h2>
          <p className="text-xs text-tbb-ink-3 mt-0.5">
            Claude reads the session notes (or a pasted transcript) and proposes
            observations — founder backstory, strategic shifts, hard-won
            learnings. You decide what makes it into the Soul File.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {sessionOptions.length > 0 && (
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Source — pick a recent BBS session
            </span>
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              disabled={isPending}
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            >
              <option value="">— Paste text instead —</option>
              {sessionOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Or paste a transcript / notes
          </span>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            disabled={isPending}
            rows={4}
            placeholder="Drop in a Fireflies transcript or your own notes from the session."
            className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
          />
        </label>
        {error && (
          <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-white">
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-tbb-success font-bold">{success}</p>
        )}
        <button
          type="button"
          onClick={runExtract}
          disabled={isPending || (!sessionId && rawText.trim().length < 50)}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
          )}
          {isPending ? "Claude is reading…" : "Extract insights"}
        </button>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2 border-t border-tbb-line-soft pt-4">
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Pending — review each
          </p>
          <ul className="space-y-2">
            {pending.map((p) => (
              <li
                key={p.id}
                className="bg-white border border-tbb-line rounded-lg p-3 flex items-start gap-3"
              >
                <p className="flex-1 text-sm text-tbb-ink-2 leading-snug whitespace-pre-wrap">
                  {p.body}
                </p>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => accept(p.id)}
                    disabled={isPending}
                    title="Accept — merge into the Soul File"
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps px-2 py-1 rounded-pill bg-tbb-success text-white hover:bg-tbb-success/90 disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" aria-hidden /> Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(p.id)}
                    disabled={isPending}
                    title="Dismiss — discard this one"
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps px-2 py-1 rounded-pill bg-white text-tbb-ink-3 border border-tbb-line hover:bg-tbb-cream-50 disabled:opacity-50"
                  >
                    <X className="w-3 h-3" aria-hidden /> Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
