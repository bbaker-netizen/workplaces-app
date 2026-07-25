"use client";

/**
 * ClientScopeToggle — master-admin control to switch coach cross-client views
 * between "All clients" (oversight) and "Just mine". Sets a cookie the
 * server-side coach queries read; refreshes so the current page re-scopes.
 * Render only for the master admin.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, User, Loader2 } from "lucide-react";
import { setClientScope } from "@/lib/actions/client-scope";
import type { ClientScope } from "@/lib/db/queries/business-builder-cross-engagement";

export function ClientScopeToggle({ current }: { current: ClientScope }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(scope: ClientScope) {
    if (scope === current) return;
    start(async () => {
      await setClientScope(scope);
      router.refresh();
    });
  }

  const base =
    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-tbb-caps transition-colors";
  return (
    <div className="inline-flex items-center rounded-pill border border-tbb-line bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => choose("all")}
        disabled={pending}
        aria-pressed={current === "all"}
        className={`${base} ${current === "all" ? "bg-tbb-blue text-white" : "text-tbb-ink-3 hover:text-tbb-navy"}`}
      >
        <Users className="w-3.5 h-3.5" aria-hidden /> All clients
      </button>
      <button
        type="button"
        onClick={() => choose("mine")}
        disabled={pending}
        aria-pressed={current === "mine"}
        className={`${base} border-l border-tbb-line ${current === "mine" ? "bg-tbb-blue text-white" : "text-tbb-ink-3 hover:text-tbb-navy"}`}
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <User className="w-3.5 h-3.5" aria-hidden />
        )}
        Just mine
      </button>
    </div>
  );
}
