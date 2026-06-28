"use client";

/**
 * Per-user Anthropic API key editor for Ask Buddy. Each Business
 * Builder pastes their own key; Buddy then bills to their Anthropic
 * account. The key is write-only here (never rendered back) and stored
 * encrypted server-side.
 */

import { useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { setAnthropicApiKey } from "@/lib/actions/user-prefs";

export function AnthropicKeyEditor({ hasKey = false }: { hasKey?: boolean }) {
  const [value, setValue] = useState("");
  const [currentlySet, setCurrentlySet] = useState(hasKey);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await setAnthropicApiKey(value);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCurrentlySet(value.trim().length > 0);
      setValue("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-pill font-bold uppercase tracking-tbb-caps " +
            (currentlySet
              ? "bg-tbb-success/10 text-tbb-success"
              : "bg-tbb-cream-50 text-tbb-ink-3 border border-tbb-line")
          }
        >
          <KeyRound className="w-3.5 h-3.5" aria-hidden />
          {currentlySet ? "Key on file" : "No key yet"}
        </span>
      </div>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={currentlySet ? "Paste a new key to replace it" : "sk-ant-..."}
        autoComplete="off"
        className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-tbb-blue"
      />
      {error && (
        <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-tbb-cream-50">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending || value.trim().length === 0}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
        >
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
          Save key
        </button>
        {saved && (
          <span className="text-[11px] text-tbb-success font-bold">
            ✓ Saved. Ask Buddy will use your key.
          </span>
        )}
      </div>
    </div>
  );
}
