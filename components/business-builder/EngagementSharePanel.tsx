"use client";

/**
 * Share this client with a second Business Builder.
 *
 * Organised by CLIENT, deliberately — the master-admin Team access page
 * is organised by person, which is the wrong shape for "Jen and I need
 * to share this one". You have the client open; the decision is about
 * this client; the control belongs here.
 *
 * The owner is shown but never toggleable. They have the client by
 * ownership, and a switch that appears to remove their access while
 * changing nothing would be a lie. Reassigning the client is how
 * ownership moves.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { setEngagementShare } from "@/lib/actions/bb-access";

export type ShareableBuilder = {
  userProfileId: string;
  fullName: string;
  email: string;
  isMasterAdmin: boolean;
  shared: boolean;
};

export function EngagementSharePanel({
  engagementId,
  clientName,
  ownerName,
  builders,
}: {
  engagementId: string;
  clientName: string;
  ownerName: string | null;
  builders: ShareableBuilder[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Optimistic, so the switch responds immediately and reverts if the
  // server refuses.
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(builders.map((b) => [b.userProfileId, b.shared])),
  );

  function toggle(b: ShareableBuilder) {
    const next = !state[b.userProfileId];
    setError(null);
    setBusyId(b.userProfileId);
    setState((s) => ({ ...s, [b.userProfileId]: next }));
    startTransition(async () => {
      const result = await setEngagementShare({
        engagementId,
        coachUserProfileId: b.userProfileId,
        shared: next,
      });
      setBusyId(null);
      if (!result.ok) {
        setState((s) => ({ ...s, [b.userProfileId]: !next }));
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3">
      <div className="space-y-1">
        <h2 className="font-bold text-tbb-navy inline-flex items-center gap-2">
          <UserPlus className="w-4 h-4" aria-hidden /> Who works this client
        </h2>
        <p className="text-xs text-tbb-ink-3 max-w-prose">
          {ownerName ? (
            <>
              <span className="font-bold text-tbb-navy">{ownerName}</span> owns{" "}
              {clientName}. Anyone switched on below shares it — it appears in
              their client list, their My Work, and their morning briefing,
              and they can be assigned action items on it.
            </>
          ) : (
            <>
              {clientName} has no assigned Business Builder, so every Builder
              can see it. Switch someone on to make it explicitly theirs
              as well.
            </>
          )}
        </p>
      </div>

      {builders.length === 0 ? (
        <p className="text-xs text-tbb-ink-3 italic">
          There is no other Business Builder to share with yet.
        </p>
      ) : (
        <ul className="divide-y divide-tbb-line-soft">
          {builders.map((b) => {
            const on = state[b.userProfileId] ?? false;
            return (
              <li
                key={b.userProfileId}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-sans text-sm font-bold text-tbb-navy truncate">
                    {b.fullName}
                    {b.isMasterAdmin && (
                      <span className="ml-2 font-mono text-[9px] uppercase tracking-tbb-caps text-tbb-ink-3">
                        Master admin
                      </span>
                    )}
                  </p>
                  <p className="font-mono text-[11px] text-tbb-ink-3 truncate">
                    {b.email}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`Share ${clientName} with ${b.fullName}`}
                  disabled={pending && busyId === b.userProfileId}
                  onClick={() => toggle(b)}
                  className={
                    "shrink-0 inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps font-bold px-3 py-1.5 rounded-pill border transition-colors disabled:opacity-50 " +
                    (on
                      ? "bg-tbb-blue text-white border-tbb-blue hover:bg-tbb-blue-700"
                      : "border-tbb-line text-tbb-ink-3 hover:border-tbb-blue hover:text-tbb-blue")
                  }
                >
                  {pending && busyId === b.userProfileId && (
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                  )}
                  {on ? "Shared" : "Share"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="font-sans text-xs text-tbb-danger border-l-2 border-tbb-danger pl-2.5 py-0.5">
          {error}
        </p>
      )}
    </section>
  );
}
