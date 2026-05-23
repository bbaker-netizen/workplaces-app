"use client";

/**
 * Signature capture panel — Phase 4.5.
 *
 * Two modes:
 *   - Type: signer types their name; we render it on a hidden canvas
 *     in a script-style font and submit the canvas as a PNG.
 *   - Draw: signer draws on a canvas with mouse / touch / pen.
 *
 * Output is always a base64 data URL (PNG) so the server side stays
 * uniform.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eraser, Loader2, PenLine, Type } from "lucide-react";
import { submitSignature } from "@/lib/actions/signatures";
import {
  CONSENT_DISCLOSURE_TEXT,
  CONSENT_DISCLOSURE_VERSION,
} from "@/lib/signing/consent-disclosure";

type Mode = "typed" | "drawn";

const TYPE_FONT = `italic 600 36px "Caveat", "Snell Roundhand", "Brush Script MT", cursive`;

export function SignaturePanel({
  token,
  signerName,
}: {
  token: string;
  signerName: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("typed");
  const [typedName, setTypedName] = useState<string>(signerName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const typedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  /* Draw mode: pointer events. */
  useEffect(() => {
    if (mode !== "drawn") return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High-DPI scaling.
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#1A1A1A";

    let drawing = false;
    let last: { x: number; y: number } | null = null;

    function pos(e: PointerEvent): { x: number; y: number } {
      const r = canvas!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function start(e: PointerEvent) {
      e.preventDefault();
      drawing = true;
      last = pos(e);
      canvas!.setPointerCapture(e.pointerId);
    }
    function move(e: PointerEvent) {
      if (!drawing || !last) return;
      const p = pos(e);
      ctx!.beginPath();
      ctx!.moveTo(last.x, last.y);
      ctx!.lineTo(p.x, p.y);
      ctx!.stroke();
      last = p;
      setHasDrawn(true);
    }
    function end(e: PointerEvent) {
      drawing = false;
      last = null;
      try {
        canvas!.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }

    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", end);
    return () => {
      canvas.removeEventListener("pointerdown", start);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", end);
      canvas.removeEventListener("pointerleave", end);
    };
  }, [mode]);

  /* Type mode: render the typed name onto a hidden canvas at submit. */
  function renderTypedToDataUrl(): string | null {
    const canvas = typedCanvasRef.current ?? document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 140;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF00"; // transparent
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = TYPE_FONT;
    ctx.fillStyle = "#1A1A1A";
    ctx.textBaseline = "middle";
    ctx.fillText(typedName.trim(), 16, canvas.height / 2);
    return canvas.toDataURL("image/png");
  }

  function clearDraw() {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function buildSignatureDataUrl(): string | null {
    if (mode === "typed") return renderTypedToDataUrl();
    const canvas = drawCanvasRef.current;
    if (!canvas || !hasDrawn) return null;
    return canvas.toDataURL("image/png");
  }

  function submit() {
    if (!confirmed) {
      setError(
        "Please tick the consent box above before submitting your signature.",
      );
      return;
    }
    if (mode === "typed" && typedName.trim().length < 2) {
      setError("Type your full name before signing.");
      return;
    }
    if (mode === "drawn" && !hasDrawn) {
      setError("Draw your signature before submitting.");
      return;
    }
    const dataUrl = buildSignatureDataUrl();
    if (!dataUrl) {
      setError("Couldn't capture the signature. Try again.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitSignature({
        token,
        signatureMethod: mode,
        signatureImageData: dataUrl,
        ip: null, // server reads from headers; we just don't have it client-side
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
        consentText: CONSENT_DISCLOSURE_TEXT,
        consentVersion: CONSENT_DISCLOSURE_VERSION,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="border border-tbb-line rounded-md bg-white p-5 space-y-4">
      <header className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Sign here
        </p>
        <h2 className="font-bold text-foreground text-xl tracking-tight">
          Type or draw your signature.
        </h2>
      </header>

      <div className="flex items-center gap-2">
        <ModeButton
          active={mode === "typed"}
          onClick={() => setMode("typed")}
          icon={<Type className="w-3.5 h-3.5" aria-hidden />}
          label="Type"
        />
        <ModeButton
          active={mode === "drawn"}
          onClick={() => setMode("drawn")}
          icon={<PenLine className="w-3.5 h-3.5" aria-hidden />}
          label="Draw"
        />
      </div>

      {mode === "typed" && (
        <div className="space-y-2">
          <input
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            disabled={isPending}
            placeholder="Type your full name"
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
          <div className="border border-dashed border-tbb-line rounded-md p-4 bg-tbb-cream-50 min-h-[110px] flex items-center">
            <span
              style={{
                font: TYPE_FONT,
                color: "#1A1A1A",
                lineHeight: 1.1,
              }}
            >
              {typedName.trim() || "Your signature"}
            </span>
          </div>
          <canvas ref={typedCanvasRef} className="hidden" />
        </div>
      )}

      {mode === "drawn" && (
        <div className="space-y-2">
          <div className="border border-dashed border-tbb-line rounded-md bg-white relative">
            <canvas
              ref={drawCanvasRef}
              className="block w-full touch-none cursor-crosshair"
              style={{ height: 180 }}
              aria-label="Signature drawing area"
            />
            {!hasDrawn && (
              <span
                className="absolute inset-0 flex items-center justify-center font-sans text-sm text-muted-foreground italic pointer-events-none"
                aria-hidden
              >
                Sign here with your mouse, finger, or stylus
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={clearDraw}
            disabled={isPending || !hasDrawn}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Eraser className="w-3 h-3" aria-hidden /> Clear
          </button>
        </div>
      )}

      <div className="border border-tbb-line rounded-md bg-tbb-cream-50 p-4 space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
          Required — please read and confirm
        </p>
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={isPending}
            className="mt-1 w-4 h-4 shrink-0"
            aria-describedby="consent-disclosure-text"
          />
          <span
            id="consent-disclosure-text"
            className="font-sans text-sm text-foreground leading-relaxed whitespace-pre-line"
          >
            {CONSENT_DISCLOSURE_TEXT}
          </span>
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-3 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        ) : (
          <CheckCircle2 className="w-4 h-4" aria-hidden />
        )}
        {isPending ? "Submitting…" : "Sign and submit"}
      </button>
    </section>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-md border transition-colors " +
        (active
          ? "bg-tbb-blue text-white border-tbb-navy"
          : "bg-white text-foreground border-tbb-line hover:bg-tbb-cream-50")
      }
    >
      {icon}
      {label}
    </button>
  );
}
