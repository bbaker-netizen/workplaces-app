"use client";

/**
 * SoulFilePreviewButton — on the prospect detail page, lets Bruce
 * see what a Soul File would look like for this prospect WITHOUT
 * formalising them into an engagement.
 *
 * Flow:
 *   - Click button → server action pulls up to 3 Fireflies transcripts
 *     matched to the prospect (by their email as an attendee, or by a
 *     "Prospect — <Company>" recording title) + Claude drafts a 6-section
 *     Soul File.
 *   - Result lands in a modal with markdown rendering + copy-to-
 *     clipboard so Bruce can paste it elsewhere or just read it.
 *   - Same draft prompt as the engagement-create-time seeder, so what
 *     he sees here is what'll save when he later formalises.
 *
 * No DB writes from this component — preview only.
 */

import { useState, useTransition } from "react";
import {
  ClipboardCopy,
  Loader2,
  Sparkles,
  X,
  Check,
} from "lucide-react";
import { previewSoulFileDraft } from "@/lib/actions/soul-file-preview";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      body: string;
      transcriptCount: number;
      transcriptTitles: string[];
    }
  | { kind: "error"; message: string };

export function SoulFilePreviewButton({
  prospectId,
}: {
  prospectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  function run() {
    setOpen(true);
    setCopied(false);
    setState({ kind: "loading" });
    startTransition(async () => {
      try {
        const r = await previewSoulFileDraft({ prospectId });
        if (r.ok) {
          setState({
            kind: "ready",
            body: r.data.body,
            transcriptCount: r.data.transcriptCount,
            transcriptTitles: r.data.transcriptTitles,
          });
        } else {
          setState({ kind: "error", message: r.error });
        }
      } catch {
        // A thrown/rejected action (e.g. the serverless function timing
        // out on a long Fireflies + Claude run, or a dropped connection)
        // must NOT escape to the page error boundary — keep it in the
        // modal as a retryable message.
        setState({
          kind: "error",
          message:
            "That took too long or the connection dropped before the draft finished. Pulling several Fireflies transcripts and drafting can be slow — please try again.",
        });
      }
    });
  }

  async function copy() {
    if (state.kind !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for browsers without clipboard permission.
      const ta = document.createElement("textarea");
      ta.value = state.body;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  function close() {
    setOpen(false);
    // Keep the ready state around briefly in case the user reopens —
    // but reset on next click via the run() handler.
  }

  return (
    <>
      <button
        type="button"
        onClick={run}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill app-cta-orange shadow-tbb-cta"
      >
        <Sparkles className="w-3.5 h-3.5" aria-hidden />
        Preview Insights from Fireflies
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-6"
          onClick={close}
        >
          <div
            className="bg-white border border-tbb-line rounded-lg shadow-tbb-lg w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Insights draft"
          >
            {/* Header */}
            <header className="flex items-start gap-3 px-5 py-4 border-b border-tbb-line-soft">
              <Sparkles
                className="w-5 h-5 text-tbb-orange mt-0.5 shrink-0"
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
                  Insights draft · preview only
                </p>
                <h2 className="font-black text-tbb-navy text-lg tracking-tight">
                  Generated from Fireflies + Claude
                </h2>
                {state.kind === "ready" && (
                  <p className="mt-1 text-xs text-tbb-ink-3">
                    Drafted from {state.transcriptCount} recent session
                    {state.transcriptCount === 1 ? "" : "s"}: {" "}
                    <span className="italic">
                      {state.transcriptTitles.join(" · ")}
                    </span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid place-items-center w-8 h-8 rounded-full text-tbb-ink-3 hover:text-tbb-navy hover:bg-tbb-cream-50"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {state.kind === "loading" && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <Loader2
                    className="w-8 h-8 text-tbb-orange animate-spin"
                    aria-hidden
                  />
                  <p className="font-bold text-tbb-navy">
                    Pulling Fireflies transcripts…
                  </p>
                  <p className="text-xs text-tbb-ink-3 max-w-md">
                    Claude is reading the last 3 sessions and drafting a
                    6-section insights brief. Usually 15-30 seconds.
                  </p>
                </div>
              )}

              {state.kind === "error" && (
                <div className="border border-tbb-danger/40 bg-tbb-danger/5 rounded-md px-4 py-3 text-sm">
                  <p className="font-bold text-tbb-danger mb-1">
                    Couldn&apos;t generate a draft.
                  </p>
                  <p className="text-tbb-ink-2">{state.message}</p>
                </div>
              )}

              {state.kind === "ready" && (
                <div className="prose prose-sm max-w-none">
                  <MarkdownBody body={state.body} />
                </div>
              )}
            </div>

            {/* Footer */}
            {state.kind === "ready" && (
              <footer className="flex items-center justify-between gap-3 px-5 py-3 border-t border-tbb-line-soft bg-tbb-cream-50">
                <p className="text-xs text-tbb-ink-3 italic">
                  This is a preview only — nothing&apos;s saved. When
                  you formalise this prospect via{" "}
                  <strong>New engagement</strong>, the same draft fires
                  fresh.
                </p>
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line bg-white text-tbb-navy hover:border-tbb-orange hover:text-tbb-orange shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" aria-hidden /> Copied
                    </>
                  ) : (
                    <>
                      <ClipboardCopy className="w-3.5 h-3.5" aria-hidden />
                      Copy markdown
                    </>
                  )}
                </button>
              </footer>
            )}
          </div>
        </div>
      )}
    </>
  );
}
