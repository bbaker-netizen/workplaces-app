"use client";

/**
 * ConfettiBurst — fixed-position full-screen confetti animation. Pops on
 * `mount` from wherever the user is on screen, runs for ~2.4s, then
 * unmounts itself by calling `onDone`. Pure canvas — no extra deps.
 *
 * Used on the Pipeline page when Bruce moves a prospect into
 * `contract_signed`. The point isn't decoration; it's a tactile
 * "you just closed business" moment. Plays once per status flip.
 */

import { useEffect, useRef } from "react";

const COLORS = [
  "#E87722", // Safety Vest Orange
  "#2E4057", // Steel Blue
  "#1A1A1A", // Foreman Black
  "#F5F1E8", // Drafting Cream
  "#FFD166",
  "#06A77D",
  "#D62246",
];

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  shape: 0 | 1; // 0 = rect, 1 = circle
};

export function ConfettiBurst({ onDone }: { onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    function resize() {
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const pieces: Piece[] = [];
    function spawn(originX: number, originY: number, count: number) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 6 + Math.random() * 8;
        pieces.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 4,
          size: 5 + Math.random() * 7,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.3,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          shape: Math.random() < 0.6 ? 0 : 1,
        });
      }
    }
    // Two bursts — one from each side, more interesting than one center pop.
    spawn(window.innerWidth * 0.25, window.innerHeight * 0.5, 90);
    spawn(window.innerWidth * 0.75, window.innerHeight * 0.5, 90);

    let raf = 0;
    const start = performance.now();
    const LIFE_MS = 2400;

    function frame(now: number) {
      const elapsed = now - start;
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      for (const p of pieces) {
        p.vy += 0.25; // gravity
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rot);
        ctx!.fillStyle = p.color;
        if (p.shape === 0) {
          ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx!.beginPath();
          ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx!.fill();
        }
        ctx!.restore();
      }
      if (elapsed < LIFE_MS) {
        raf = requestAnimationFrame(frame);
      } else {
        onDone?.();
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [onDone]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9999]"
      role="presentation"
    >
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute inset-x-0 top-[40%] flex flex-col items-center text-center select-none">
        <p className="font-display text-5xl sm:text-7xl font-black text-tbb-navy drop-shadow-sm tracking-tight">
          You closed it.
        </p>
        <p className="mt-2 font-sans text-base sm:text-lg text-tbb-ink-2">
          Go put the kettle on. ☕
        </p>
      </div>
    </div>
  );
}
