"use client";

/**
 * Per-client portal module manager. Lets a coach choose which modules a
 * client sees in their portal, from the client's engagement profile.
 * Each toggle writes a portal_module_assignment via setModuleEnabled;
 * modules default to ON, so a toggle off is what creates an override.
 */

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { setModuleEnabled } from "@/lib/actions/modules";

export type ModuleState = {
  key: string;
  label: string;
  enabled: boolean;
};

export function PortalModuleManager({
  engagementId,
  modules,
}: {
  engagementId: string;
  modules: ModuleState[];
}) {
  const [states, setStates] = useState<Record<string, boolean>>(
    Object.fromEntries(modules.map((m) => [m.key, m.enabled])),
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      }
    });
  }

  return (
    <div className="space-y-2">
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
