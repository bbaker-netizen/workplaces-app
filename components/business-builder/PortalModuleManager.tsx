"use client";

/**
 * Per-client portal module manager. Lets a coach choose which modules a
 * client sees in their portal, from the client's engagement profile.
 * Each toggle writes a portal_module_assignment via setModuleEnabled;
 * modules default to ON, so a toggle off is what creates an override.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import {
  confirmModuleSelection,
  setModuleEnabled,
} from "@/lib/actions/modules";

export type ModuleState = {
  key: string;
  label: string;
  enabled: boolean;
};

export function PortalModuleManager({
  engagementId,
  modules,
  reviewed,
}: {
  engagementId: string;
  modules: ModuleState[];
  /**
   * Has anyone recorded a choice for this client yet? Drives the confirm
   * prompt — see `confirmModuleSelection` for why an untouched list has
   * to be confirmable rather than merely looked at.
   */
  reviewed: boolean;
}) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, boolean>>(
    Object.fromEntries(modules.map((m) => [m.key, m.enabled])),
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(reviewed);
  const [confirming, setConfirming] = useState(false);
  const [, startTransition] = useTransition();

  function toggle(key: string) {
    const next = !states[key];
    setStates((s) => ({ ...s, [key]: next }));
    setPendingKey(key);
    setError(null);
    startTransition(async () => {
      const r = await setModuleEnabled({
        engagementId,
        // @ts-expect-error module key is a runtime-validated enum string
        module: key,
        isEnabled: next,
      });
      setPendingKey(null);
      if (!r.ok) {
        // Revert on failure.
        setStates((s) => ({ ...s, [key]: !next }));
        setError(r.error);
        return;
      }
      // A toggle is itself a recorded choice, so it clears the prompt.
      // Refresh so the onboarding panel above re-runs its pre-flight
      // rather than sitting there still saying "not reviewed".
      setIsConfirmed(true);
      router.refresh();
    });
  }

  function confirm() {
    setConfirming(true);
    setError(null);
    startTransition(async () => {
      const r = await confirmModuleSelection(engagementId);
      setConfirming(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setIsConfirmed(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {!isConfirmed && (
        <div className="rounded-md border border-tbb-blue/50 bg-tbb-blue/5 p-3 flex items-start gap-3 flex-wrap">
          <p className="text-xs text-tbb-ink-2 flex-1 min-w-[16rem]">
            Every module is on by default, so nothing here has been chosen
            yet. Switch off anything this client shouldn&apos;t see, then
            confirm. If they should see all of it, just confirm — onboarding
            stays blocked until you do.
          </p>
          <button
            type="button"
            onClick={confirm}
            disabled={confirming}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 flex-none"
          >
            {confirming ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="w-3.5 h-3.5" aria-hidden />
            )}
            Confirm these modules
          </button>
        </div>
      )}
      <ul className="grid sm:grid-cols-2 gap-1.5">
        {modules.map((m) => {
          const on = states[m.key];
          const busy = pendingKey === m.key;
          return (
            <li key={m.key}>
              <button
                type="button"
                onClick={() => toggle(m.key)}
                disabled={busy}
                aria-pressed={on}
                className={
                  "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-sm transition-colors " +
                  (on
                    ? "border-tbb-blue/40 bg-tbb-blue-50 text-tbb-navy"
                    : "border-tbb-line bg-white text-tbb-ink-3 hover:bg-tbb-cream-50")
                }
              >
                <span className="font-bold">{m.label}</span>
                <span
                  className={
                    "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps " +
                    (on ? "text-tbb-blue" : "text-tbb-ink-4")
                  }
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                  ) : on ? (
                    <>
                      <Check className="w-3.5 h-3.5" aria-hidden /> On
                    </>
                  ) : (
                    "Off"
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-tbb-danger">{error}</p>}
    </div>
  );
}
