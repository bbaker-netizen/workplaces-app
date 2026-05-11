"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  generateGapAnalysis,
  generateHiringAssessment,
  generateInterviewGuide,
  generateOnboardingPack,
} from "@/lib/actions/hiring-ai";

export function HireGenerateButtons({ hireId }: { hireId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activePanel, setActivePanel] = useState<
    null | "interview" | "onboarding"
  >(null);

  // Interview-specific state
  const [interviewTranscript, setInterviewTranscript] = useState("");
  // Onboarding-specific state
  const [startDate, setStartDate] = useState("");
  const [compensation, setCompensation] = useState("");

  type Outcome =
    | { ok: true; data: { result: string } }
    | { ok: false; error: string };
  const run = async (label: string, fn: () => Promise<Outcome>) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess(`${label} added to candidate notes.`);
        setActivePanel(null);
        setInterviewTranscript("");
        setStartDate("");
        setCompensation("");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <GenerateButton
          label="Gap analysis"
          disabled={isPending}
          onClick={() =>
            run("Gap analysis", () => generateGapAnalysis(hireId))
          }
        />
        <GenerateButton
          label="Interview guide"
          disabled={isPending}
          onClick={() =>
            run("Interview guide", () => generateInterviewGuide(hireId))
          }
        />
        <GenerateButton
          label="Hiring assessment"
          disabled={isPending}
          onClick={() => setActivePanel("interview")}
        />
        <GenerateButton
          label="Onboarding pack"
          disabled={isPending}
          onClick={() => setActivePanel("onboarding")}
        />
      </div>

      {activePanel === "interview" && (
        <div className="border border-tbb-line rounded-md bg-white p-4 space-y-3">
          <h4 className="font-bold text-foreground text-base tracking-tight">
            Interview transcript
          </h4>
          <p className="font-sans text-sm text-muted-foreground">
            Paste the full interview transcript. Claude reads it against the
            gap report and produces the hiring assessment.
          </p>
          <textarea
            value={interviewTranscript}
            onChange={(e) => setInterviewTranscript(e.target.value)}
            rows={8}
            disabled={isPending}
            placeholder="Paste transcript here…"
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setActivePanel(null)}
              disabled={isPending}
              className="font-sans text-xs uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                isPending || interviewTranscript.trim().length < 100
              }
              onClick={() =>
                run("Hiring assessment", () =>
                  generateHiringAssessment(hireId, interviewTranscript),
                )
              }
              className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              {isPending ? "Running…" : "Run assessment"}
            </button>
          </div>
        </div>
      )}

      {activePanel === "onboarding" && (
        <div className="border border-tbb-line rounded-md bg-white p-4 space-y-3">
          <h4 className="font-bold text-foreground text-base tracking-tight">
            Onboarding details
          </h4>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                Start date
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isPending}
                className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                Compensation
              </span>
              <input
                type="text"
                value={compensation}
                onChange={(e) => setCompensation(e.target.value)}
                disabled={isPending}
                placeholder="e.g. $90K base + 10% bonus"
                className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setActivePanel(null)}
              disabled={isPending}
              className="font-sans text-xs uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run("Onboarding pack", () =>
                  generateOnboardingPack(
                    hireId,
                    startDate || undefined,
                    compensation || undefined,
                  ),
                )
              }
              className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              {isPending ? "Running…" : "Generate pack"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}
      {success && !isPending && (
        <p className="font-sans text-sm text-tbb-navy border border-tbb-line rounded-md px-3 py-2 bg-tbb-cream-50">
          {success}
        </p>
      )}
    </div>
  );
}

function GenerateButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-blue text-tbb-navy bg-white hover:bg-tbb-cream-50 disabled:opacity-50 disabled:cursor-wait"
    >
      <Sparkles className="w-3.5 h-3.5" aria-hidden />
      {label}
    </button>
  );
}
