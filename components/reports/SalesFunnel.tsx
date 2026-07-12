/**
 * Sales pyramid — the condensed 3-tier funnel the Workplaces methodology
 * teaches: New Lead (top, widest) → Prospects → Won (bottom, narrowest).
 *
 * Widths are a fixed top-wide / bottom-narrow taper so it always reads as a
 * clean pyramid; the real numbers live in the labels. Dark bands with light
 * (white) text so every tier is legible. Pure CSS trapezoids — no chart
 * library.
 */

export type FunnelTierInput = { label: string; count: number };

export function SalesFunnel({ tiers }: { tiers: FunnelTierInput[] }) {
  if (tiers.length === 0 || tiers.every((t) => t.count === 0)) {
    return (
      <p className="text-sm text-tbb-ink-4 italic py-8 text-center">
        No leads in the pyramid yet.
      </p>
    );
  }

  const n = tiers.length;
  const top = tiers[0]?.count || 0;
  // Fixed taper: top tier full width, narrowing to 40% at the base.
  const MAX_W = 1;
  const MIN_W = 0.4;
  const widthAt = (i: number) =>
    n <= 1 ? MAX_W : MAX_W - (MAX_W - MIN_W) * (i / (n - 1));

  return (
    <div className="w-full h-full flex flex-col">
      <div className="mx-auto max-w-md w-full flex-1 flex flex-col">
        {tiers.map((t, i) => {
          const isWon = i === n - 1;
          const topW = widthAt(i);
          // Base of the last band tapers a little further for the funnel tip.
          const botW = isWon ? Math.max(MIN_W - 0.14, 0.22) : widthAt(i + 1);
          const tl = (0.5 - topW / 2) * 100;
          const tr = (0.5 + topW / 2) * 100;
          const bl = (0.5 - botW / 2) * 100;
          const br = (0.5 + botW / 2) * 100;
          const conv = top > 0 ? Math.round((t.count / top) * 100) : 0;

          return (
            <div
              key={t.label}
              className="relative flex-1 min-h-[66px] flex items-center justify-center text-white"
              style={{
                clipPath: `polygon(${tl}% 0, ${tr}% 0, ${br}% 100%, ${bl}% 100%)`,
                backgroundColor: isWon
                  ? "#E87722"
                  : `rgb(${46 - i * 6} ${64 - i * 8} ${87 - i * 10})`,
                marginBottom: isWon ? 0 : 2,
              }}
            >
              <div className="text-center leading-tight px-2">
                <p className="text-[13px] font-bold uppercase tracking-tbb-caps text-white">
                  {t.label}
                </p>
                <p className="text-[13px] tabular-nums text-white">
                  <span className="font-bold">{t.count}</span>
                  {i > 0 && (
                    <span className="text-white/85"> · {conv}% of top</span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-[11px] text-tbb-ink-3">
        Each tier rolls up its stages; the % is conversion from the top of the
        pyramid.
      </p>
    </div>
  );
}
