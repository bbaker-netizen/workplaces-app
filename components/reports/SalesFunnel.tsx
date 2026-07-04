/**
 * Traditional sales funnel — the classic top-wide / bottom-narrow shape
 * the Workplaces methodology teaches. Each stage is a centered trapezoid
 * that connects to the next, so the whole thing reads as one funnel
 * silhouette, with the stage name, the count, and the conversion rate
 * from the top of the funnel labelled on each band.
 *
 * Pure CSS (clip-path trapezoids) — no chart library, crisp labels, and
 * it scales with its container. Brand palette: Steel Blue funnel body
 * narrowing to a Safety Vest Orange "Won" band at the tip.
 */

export type FunnelStageInput = { label: string; count: number };

export function SalesFunnel({ stages }: { stages: FunnelStageInput[] }) {
  if (stages.length === 0 || stages.every((s) => s.count === 0)) {
    return (
      <p className="text-sm text-tbb-ink-4 italic py-8 text-center">
        No leads in the funnel yet.
      </p>
    );
  }

  const top = stages[0]?.count || 0;
  const max = Math.max(1, ...stages.map((s) => s.count));
  // Band width as a fraction of the container. Floor at 0.34 so even a
  // near-empty stage stays wide enough to read its label — the count on
  // the band carries the real number.
  const widthFor = (c: number) => Math.max(0.34, c / max);

  return (
    <div className="w-full">
      <div className="mx-auto max-w-md">
        {stages.map((s, i) => {
          const isWon = i === stages.length - 1;
          const topW = widthFor(s.count);
          const botW = widthFor(stages[i + 1]?.count ?? s.count);
          // Trapezoid: top edge = this stage's width, bottom edge = next
          // stage's width, both centered. Percentages are of the row width.
          const tl = (0.5 - topW / 2) * 100;
          const tr = (0.5 + topW / 2) * 100;
          const bl = (0.5 - botW / 2) * 100;
          const br = (0.5 + botW / 2) * 100;
          const conv = top > 0 ? Math.round((s.count / top) * 100) : 0;

          return (
            <div
              key={s.label}
              className="relative h-[52px] flex items-center justify-center text-white"
              style={{
                clipPath: `polygon(${tl}% 0, ${tr}% 0, ${br}% 100%, ${bl}% 100%)`,
                backgroundColor: isWon
                  ? "#E87722"
                  : `rgb(46 64 87 / ${0.6 + (i / stages.length) * 0.4})`,
                marginBottom: i === stages.length - 1 ? 0 : 2,
              }}
            >
              <div className="text-center leading-tight px-2">
                <p className="text-[11px] font-bold uppercase tracking-tbb-caps">
                  {s.label}
                </p>
                <p className="text-[11px] tabular-nums">
                  <span className="font-bold">{s.count}</span>
                  {i > 0 && (
                    <span className="opacity-80"> · {conv}% of top</span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-[11px] text-tbb-ink-3">
        Width shows relative volume at each stage; the % is conversion from the
        top of the funnel.
      </p>
    </div>
  );
}
