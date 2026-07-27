/**
 * Prospect assessment panel — what the lead told us before we ever spoke.
 *
 * Renders the stored `prospects.assessment` (today: Base Camp) as the same
 * picture the reader saw on the result screen: the weakest Business Building
 * Block named as their base camp, all four blocks with their band, and the
 * answers underneath. Bruce opens a lead and sees their own words, so the
 * first conversation starts from evidence rather than a cold discovery.
 *
 * Server component — nothing here is interactive.
 *
 * Band class names are written out in full in a literal lookup below rather
 * than built by interpolation. Tailwind scans source text, so a class name
 * assembled at runtime is purged from the stylesheet and renders as nothing.
 */

import { ClipboardCheck } from "lucide-react";
import {
  ASSESSMENT_BLOCKS,
  MAX_BLOCK_SCORE,
  bandFor,
  bandLabel,
  blockLabel,
  goalLabel,
  humanizeAnswerKey,
  type AssessmentBand,
  type StoredAssessment,
} from "@/lib/pipeline/assessment";

/** Panel title by producing tool. Base Camp was the first; "Before we meet"
 *  is the pre-meeting Stages assessment. An unknown tool falls back to a
 *  neutral label rather than mislabelling itself as one of the others. */
const TOOL_TITLES: Record<string, string> = {
  base_camp: "Base Camp assessment",
  pre_meeting: "Before we meet: pre-meeting assessment",
};

/** Full literal class strings — see the note in the file header. */
const BAND_STYLES: Record<AssessmentBand, { text: string; bar: string }> = {
  solid: { text: "text-tbb-success", bar: "bg-tbb-success" },
  watch: { text: "text-tbb-warning", bar: "bg-tbb-warning" },
  cracked: { text: "text-tbb-danger", bar: "bg-tbb-danger" },
};

export function ProspectAssessmentPanel({
  assessment,
  takenAt,
}: {
  assessment: StoredAssessment;
  takenAt: Date | null;
}) {
  const weakest = assessment.weakestBlock;
  const headlineScore = assessment.weakestScore;
  const headlineBand = headlineScore === null ? null : bandFor(headlineScore);
  const goal = goalLabel(assessment.goalCode);
  const answers = Object.entries(assessment.answers);

  return (
    <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
      <header className="flex items-baseline justify-between gap-3 border-b border-tbb-line-soft px-5 py-3">
        <h2 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          <ClipboardCheck className="w-3.5 h-3.5" aria-hidden />
          {TOOL_TITLES[assessment.tool] ?? "Assessment"}
        </h2>
        {takenAt && (
          <span className="text-[11px] text-tbb-ink-3">
            {takenAt.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </header>

      <div className="px-5 py-4 space-y-4">
        {/* The verdict, in the words they were given. */}
        {weakest && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Their base camp
            </p>
            <p className="text-tbb-h4 font-bold text-tbb-navy tracking-tbb-tight">
              The {blockLabel(weakest)} block
              {headlineBand && (
                <span className={`ml-2 text-tbb-body ${BAND_STYLES[headlineBand].text}`}>
                  {bandLabel(headlineBand)}
                </span>
              )}
            </p>
            {assessment.secondBlock && assessment.secondBlock !== weakest && (
              <p className="text-xs text-tbb-ink-3 mt-0.5">
                Next weakest: {blockLabel(assessment.secondBlock)}
              </p>
            )}
          </div>
        )}

        {/* Why they came, plus the two sizing facts that set the revenue band
            before any pricing conversation. */}
        {(goal || assessment.teamSize || assessment.revenueBand) && (
          <div className="flex flex-wrap gap-1.5">
            {goal && (
              <Chip label={goal} strong />
            )}
            {assessment.teamSize && <Chip label={`Team: ${assessment.teamSize}`} />}
            {assessment.revenueBand && (
              <Chip label={`Revenue: ${assessment.revenueBand}`} />
            )}
          </div>
        )}

        {/* All four blocks. Score is 0 to 6 where higher is worse, so the bar
            shows strength (the inverse) to match the reader's result screen. */}
        {Object.keys(assessment.blocks).length > 0 && (
          <div className="space-y-2">
            {ASSESSMENT_BLOCKS.map((key) => {
              const value = assessment.blocks[key];
              if (value === undefined) return null;
              const band = bandFor(value);
              const strength = Math.max(
                8,
                Math.round(((MAX_BLOCK_SCORE - value) / MAX_BLOCK_SCORE) * 100),
              );
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-tbb-ink-2 font-bold">
                      {blockLabel(key)}
                    </span>
                    <span className={`font-bold ${BAND_STYLES[band].text}`}>
                      {bandLabel(band)}
                      <span className="ml-1.5 font-normal text-tbb-ink-3">
                        {value}/{MAX_BLOCK_SCORE}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-pill bg-tbb-line-soft overflow-hidden">
                    <div
                      className={`h-full rounded-pill ${BAND_STYLES[band].bar}`}
                      style={{ width: `${strength}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-tbb-ink-3 pt-0.5">
              Score out of {MAX_BLOCK_SCORE}, higher is worse. The bar shows
              strength.
            </p>
          </div>
        )}

        {/* Their answers verbatim. This is the part worth reading in the car
            on the way to the meeting. */}
        {answers.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy">
              What they said ({answers.length})
              <span className="ml-1 font-normal group-open:hidden">show</span>
              <span className="ml-1 font-normal hidden group-open:inline">hide</span>
            </summary>
            <dl className="mt-2 space-y-2 border-t border-tbb-line-soft pt-2">
              {answers.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[11px] text-tbb-ink-3">
                    {humanizeAnswerKey(key)}
                  </dt>
                  <dd className="text-sm text-tbb-ink-2">{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>
    </section>
  );
}

function Chip({ label, strong }: { label: string; strong?: boolean }) {
  return (
    <span
      className={
        strong
          ? "inline-flex items-center rounded-pill bg-tbb-navy text-white text-[11px] font-bold uppercase tracking-tbb-caps px-2.5 py-1"
          : "inline-flex items-center rounded-pill bg-tbb-cream text-tbb-ink-2 text-[11px] font-bold px-2.5 py-1"
      }
    >
      {label}
    </span>
  );
}
