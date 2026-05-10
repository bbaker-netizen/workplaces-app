"use client";

import { useState, useTransition } from "react";
import { Loader2, Ban } from "lucide-react";
import { voidSignatureEnvelope } from "@/lib/actions/signatures";

export function EnvelopeActions({ envelopeId }: { envelopeId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function voidIt() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Cancel this signing request? Signers will see a cancelled banner if they open the link.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await voidSignatureEnvelope(envelopeId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={voidIt}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md border border-[#E87722] text-[#E87722] bg-white hover:bg-[#F5F1E8] disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        ) : (
          <Ban className="w-4 h-4" aria-hidden />
        )}
        Cancel signing
      </button>
      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
        >
          {error}
        </p>
      )}
    </section>
  );
}
