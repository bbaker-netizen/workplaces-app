"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import {
  clearMySignatureImage,
  uploadMySignatureImage,
} from "@/lib/actions/signatures";

const MAX_BYTES = 600 * 1024;

export function CoachSignatureManager({
  initial,
}: {
  initial: string | null;
}) {
  const [current, setCurrent] = useState<string | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function pick() {
    inputRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      setError("Pick a PNG or JPG file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That file is bigger than 600 KB. Try a tighter crop.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl.startsWith("data:image/")) {
        setError("Couldn't read that file. Try another.");
        return;
      }
      startTransition(async () => {
        const result = await uploadMySignatureImage({
          signatureImageData: dataUrl,
        });
        if (!result.ok) setError(result.error);
        else setCurrent(dataUrl);
      });
    };
    reader.onerror = () => setError("Couldn't read that file. Try another.");
    reader.readAsDataURL(file);
  }

  function clear() {
    if (!current) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove your stored signature?")
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await clearMySignatureImage();
      if (!result.ok) setError(result.error);
      else setCurrent(null);
    });
  }

  return (
    <section className="border border-tbb-line rounded-md bg-white p-5 space-y-4">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Stored signature
        </p>
      </header>

      {current ? (
        <div className="space-y-3">
          <div className="border border-dashed border-tbb-line rounded-md bg-tbb-cream-50 p-4 flex items-center justify-center min-h-[140px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current}
              alt="Your signature"
              className="max-h-32 object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={pick}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-blue text-tbb-navy bg-white hover:bg-tbb-cream-50 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
              ) : (
                <Upload className="w-3 h-3" aria-hidden />
              )}
              Replace
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-danger text-tbb-danger bg-white hover:bg-tbb-cream-50 disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" aria-hidden />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="border border-dashed border-tbb-line rounded-md bg-tbb-cream-50 p-6 text-center">
            <p className="font-sans text-sm text-muted-foreground italic">
              No signature uploaded yet.
            </p>
          </div>
          <button
            type="button"
            onClick={pick}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="w-4 h-4" aria-hidden />
            )}
            Upload signature
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={onFile}
        disabled={isPending}
      />

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}
    </section>
  );
}
