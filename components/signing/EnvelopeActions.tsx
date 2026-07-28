"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Ban, Trash2 } from "lucide-react";
import {
  deleteSignatureEnvelope,
  voidSignatureEnvelope,
} from "@/lib/actions/signatures";

export function EnvelopeActions({
  envelopeId,
  subject,
  status,
  /** Delete is the practice owner's call alone — see the action. */
  canDelete = false,
}: {
  envelopeId: string;
  subject?: string;
  status?: string;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isCompleted = status === "completed";

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

  function deleteIt() {
    // Two prompts for a completed agreement, one otherwise. A signed contract
    // is a legal record; a single mis-click shouldn't be able to remove one.
    if (typeof window !== "undefined") {
      const first = window.confirm(
        `Permanently delete “${subject ?? "this agreement"}”?\n\n` +
          "This removes the agreement, its signers, and the document files. It cannot be undone.",
      );
      if (!first) return;
      if (
        isCompleted &&
        !window.confirm(
          "This agreement has been SIGNED and completed.\n\n" +
            "Deleting it destroys the executed contract and its certificate of completion. Only do this for test data.\n\nDelete anyway?",
        )
      ) {
        return;
      }
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteSignatureEnvelope(envelopeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Back to the record the agreement belonged to — where its list of
      // agreements lives — not the top of the pipeline. Deleting one item
      // shouldn't cost you your place.
      router.push(
        result.data.prospectId
          ? `/business-builder/pipeline/${result.data.prospectId}`
          : result.data.engagementId
            ? `/business-builder/engagements/${result.data.engagementId}`
            : "/business-builder/pipeline",
      );
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {!isCompleted && (
          <button
            type="button"
            onClick={voidIt}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill border border-tbb-danger text-tbb-danger bg-white hover:bg-tbb-cream-50 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Ban className="w-4 h-4" aria-hidden />
            )}
            Cancel signing
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={deleteIt}
            disabled={isPending}
            title="Permanently delete this agreement and its files"
            className="inline-flex items-center gap-1.5 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-danger text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="w-4 h-4" aria-hidden />
            )}
            Delete permanently
          </button>
        )}
      </div>
      {canDelete && (
        <p className="font-sans text-xs text-tbb-ink-3">
          Deleting is for test data. It removes the agreement, its signers and
          the document files, and can&apos;t be undone.
        </p>
      )}
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
