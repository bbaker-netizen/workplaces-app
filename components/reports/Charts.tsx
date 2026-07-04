/**
 * Lightweight, server-rendered charts for the reports dashboard.
 *
 * Deliberately dependency-free — pure SVG + CSS bars in the brand palette
 * (Steel Blue structure, Safety Vest Orange accents, Foreman Black ink on
 * Drafting Cream). No client JS, no charting library: the reports are
 * read-only and render fast on the server, which matches the heritage
 * "master ledger" feel better than an interactive widget would.
 */

/* -------------------- horizontal bar list -------------------- */

export function HBarList({
  rows,
}: {
  rows: { label: string; value: number; sub?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) {
    return <EmptyChart />;
  }
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-bold text-tbb-navy truncate">{r.label}</span>
            <span className="tabular-nums text-tbb-ink-2">
              {r.value}
              {r.sub ? (
                <span className="text-tbb-ink-3 font-normal"> · {r.sub}</span>
              ) : null}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-tbb-cream-50 overflow-hidden">
            <div
              className="h-full rounded-full bg-tbb-blue"
              style={{ width: `${Math.round((r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* --------------------- column chart (SVG) --------------------- */

export function ColumnChart({
  rows,
  height = 140,
}: {
  rows: { label: string; count: number }[];
  height?: number;
}) {
  if (rows.length === 0 || rows.every((r) => r.count === 0)) {
    return <EmptyChart />;
  }
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div>
      <div
        className="flex items-end gap-[6px]"
        style={{ height }}
        aria-hidden
      >
        {rows.map((r) => {
          const h = Math.round((r.count / max) * (height - 20));
          return (
            <div
              key={r.label}
              className="flex-1 flex flex-col items-center justify-end gap-1"
            >
              {r.count > 0 && (
                <span className="text-[10px] font-bold text-tbb-ink-2 tabular-nums">
                  {r.count}
                </span>
              )}
              <div
                className="w-full rounded-t-sm bg-tbb-blue"
                style={{ height: Math.max(h, r.count > 0 ? 4 : 2) }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[6px] mt-1.5">
        {rows.map((r) => (
          <span
            key={r.label}
            className="flex-1 text-center text-[10px] font-mono text-tbb-ink-3"
          >
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- shared --------------------------- */

export function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-4 bg-white shadow-tbb-sm " +
        (accent ? "border-tbb-orange/40" : "border-tbb-line")
      }
    >
      <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        {label}
      </p>
      <p
        className={
          "mt-1 font-display font-bold text-3xl tracking-tight leading-none " +
          (accent ? "text-tbb-orange" : "text-tbb-navy")
        }
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-tbb-ink-3">{hint}</p>}
    </div>
  );
}

function EmptyChart() {
  return (
    <p className="text-sm text-tbb-ink-4 italic py-6 text-center">
      Not enough data yet.
    </p>
  );
}
