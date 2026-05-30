/**
 * BuilderLoader — Buddy laying bricks (#18).
 *
 * Replaces the old spinning-wheel loader with an on-brand "building a
 * brick-and-mortar business" animation: a little hard-hat (Buddy) bobs
 * along the top while a brick wall lays itself up, course by course,
 * then resets and builds again. Pure CSS — no client JS, SSR-safe.
 *
 * Exported as `SquiggleSpinner` too (backwards-compat alias) so every
 * existing loader call site picks up the new look with no other changes.
 */

const LOADER_CSS = `
@keyframes tbb-brick-lay {
  0%   { opacity: 0; transform: translateY(-9px) scaleY(0.6); }
  12%  { opacity: 1; transform: translateY(0) scaleY(1); }
  80%  { opacity: 1; transform: translateY(0) scaleY(1); }
  92%  { opacity: 0; transform: translateY(0) scaleY(1); }
  100% { opacity: 0; }
}
@keyframes tbb-buddy-bob {
  0%, 100% { transform: translateX(-22px) translateY(0); }
  25%      { transform: translateX(-9px)  translateY(-3px); }
  50%      { transform: translateX(7px)   translateY(0); }
  75%      { transform: translateX(20px)  translateY(-3px); }
}
.tbb-bl-wall { position: relative; width: 60px; height: 44px; transform-origin: center; }
.tbb-bl-brick {
  position: absolute; height: 10px; border-radius: 2px;
  background: var(--tbb-orange, #E87722);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.14);
  animation: tbb-brick-lay 2.4s ease-in-out infinite;
}
.tbb-bl-hat {
  position: absolute; top: -3px; left: 23px; width: 14px; height: 8px;
  border-radius: 7px 7px 0 0; background: var(--tbb-steel, #2E4057);
  animation: tbb-buddy-bob 2.4s ease-in-out infinite;
}
.tbb-bl-hat::after {
  content: ""; position: absolute; bottom: -2px; left: -3px; right: -3px;
  height: 2px; border-radius: 1px; background: var(--tbb-steel, #2E4057);
}
@media (prefers-reduced-motion: reduce) {
  .tbb-bl-brick, .tbb-bl-hat { animation-duration: 0s; }
  .tbb-bl-brick { opacity: 1; }
}
`;

// Brick layout: three courses in a running bond, laid bottom-up.
const BRICKS: Array<{ left: number; top: number; delay: string }> = [
  { left: 0, top: 32, delay: "0s" },
  { left: 21, top: 32, delay: "0.2s" },
  { left: 42, top: 32, delay: "0.4s" },
  { left: 10, top: 20, delay: "0.6s" },
  { left: 31, top: 20, delay: "0.8s" },
  { left: 0, top: 8, delay: "1.0s" },
  { left: 21, top: 8, delay: "1.2s" },
  { left: 42, top: 8, delay: "1.4s" },
];

export function BuilderLoader({
  size = 64,
  label = "Building…",
}: {
  size?: number;
  label?: string | null;
}) {
  const scale = size / 64;
  return (
    <div
      className="flex flex-col items-center gap-3"
      role="status"
      aria-label={label ?? "Loading"}
    >
      <style dangerouslySetInnerHTML={{ __html: LOADER_CSS }} />
      <div className="tbb-bl-wall" style={{ transform: `scale(${scale})` }} aria-hidden>
        {BRICKS.map((b, i) => (
          <span
            key={i}
            className="tbb-bl-brick"
            style={{ width: 18, left: b.left, top: b.top, animationDelay: b.delay }}
          />
        ))}
        <span className="tbb-bl-hat" />
      </div>
      {label && (
        <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
          {label}
        </p>
      )}
    </div>
  );
}

/** Backwards-compat alias — existing call sites import SquiggleSpinner. */
export const SquiggleSpinner = BuilderLoader;
