/**
 * SquiggleSpinner — characterful page-load animation. A hand-drawn-
 * looking outer ring (path with wobble + dashed stroke) rotates one
 * way while an inner dashed circle rotates the other. The outer
 * stroke draws on and off so it looks like someone is sketching the
 * circle in real time.
 *
 * Pure CSS animation — no client JS, no deps. Server-renders fine.
 */

export function SquiggleSpinner({
  size = 64,
  label = "Building…",
}: {
  size?: number;
  label?: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-label={label ?? "Loading"}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        className="app-squiggle-wrap"
        aria-hidden
      >
        {/* Outer hand-drawn-looking ring — wobbly cubic path that
            traces a not-quite-circle so it reads as sketched. */}
        <path
          d="M 50 12
             C 70 12, 86 28, 88 50
             C 90 70, 72 86, 50 88
             C 28 88, 12 72, 12 50
             C 12 30, 30 12, 50 12 Z"
          stroke="var(--tbb-orange)"
          strokeWidth="4"
          strokeLinecap="round"
          className="app-squiggle-path"
        />

        {/* Inner dashed ring spinning the other way — adds depth and
            keeps the eye engaged when the outer is mid-erase. */}
        <g className="app-squiggle-inner">
          <circle
            cx="50"
            cy="50"
            r="24"
            stroke="var(--tbb-steel)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="4 8"
            opacity="0.7"
          />
        </g>
      </svg>
      {label && (
        <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
          {label}
        </p>
      )}
    </div>
  );
}
