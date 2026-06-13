"use client";

/**
 * "Invite client to their portal" — the deferred-invite step. Shown on a
 * client's engagement page once you've prepared their portal and want to
 * give them access. Builds the real Clerk org + emails the invite.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail } from "lucide-react";
import { inviteClientToPortal } from "@/lib/actions/invite-client";

export function InviteClientButton({
  engagementId,
  invited,
  clientEmail,
}: {
  engagementId: string;
  invited: boolean;
  clientEmail: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (invited) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-success">
        <Check className="w-3.5 h-3.5" aria-hidden /> Client invited
      </p>
    );
  }

  function go() {
    if (
      !window.confirm(
        `Send ${clientEmail ?? "the client"} an invite to their portal?\n\n` +
          "This creates their login and emails them — do it once the portal " +
          "is prepared.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await inviteClientToPortal(engagementId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={go}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <Mail className="w-3.5 h-3.5" aria-hidden />
        )}
        {isPending ? "Inviting…" : "Invite client to their portal"}
      </button>
      {clientEmail && (
        <p className="text-[11px] text-tbb-ink-3">Invite goes to {clientEmail}</p>
      )}
      {error && <p className="text-sm text-tbb-danger">{error}</p>}
    </div>
  );
}
