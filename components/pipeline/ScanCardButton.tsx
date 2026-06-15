"use client";

/**
 * "Scan business card" — snap a photo of a card (camera on mobile) and
 * Claude vision fills the new-lead fields. Built for adding leads on a
 * phone at a networking event. The photo is downscaled in the browser
 * before upload so it's fast and stays under the model's image cap.
 */

import { useRef, useState, useTransition } from "react";
import { Camera, Loader2 } from "lucide-react";
import { scanBusinessCard, type ScannedCard } from "@/lib/actions/scan-card";

export function ScanCardButton({
  onScanned,
}: {
  onScanned: (data: ScannedCard) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleFile(file: File) {
    setMsg(null);
    setIsError(false);
    startTransition(async () => {
      let dataUrl: string;
      try {
        dataUrl = await downscaleToDataUrl(file);
      } catch {
        setIsError(true);
        setMsg("Couldn't read that image. Try again.");
        return;
      }
      const r = await scanBusinessCard(dataUrl);
      if (!r.ok) {
        setIsError(true);
        setMsg(r.error);
        return;
      }
      onScanned(r.data);
      const filled = Object.values(r.data).filter(Boolean).length;
      setIsError(false);
      setMsg(
        `Filled ${filled} field${filled === 1 ? "" : "s"} from the card — review below before saving.`,
      );
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-tbb-line bg-tbb-cream-50 p-3 flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-md bg-tbb-navy text-white hover:bg-tbb-blue disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        ) : (
          <Camera className="w-4 h-4" aria-hidden />
        )}
        {isPending ? "Reading card…" : "Scan business card"}
      </button>
      <span
        className={`text-xs ${isError ? "text-tbb-danger" : "text-tbb-ink-3"}`}
      >
        {msg ?? "Snap a photo and we'll fill in what we can."}
      </span>
    </div>
  );
}

/**
 * Decode the picked file, scale its longest edge down to 1600px, and
 * re-encode as JPEG — keeps phone photos small and within the model's
 * inline-image limit.
 */
async function downscaleToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.82);
}
