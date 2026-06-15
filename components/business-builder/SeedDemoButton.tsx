"use client";

/**
 * Master-admin tool: spin up a fully-populated sample engagement so the
 * whole system can be walked end-to-end. The result is a normal
 * engagement, so it archives / deletes like any client.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { seedDemoEngagement } from "@/lib/actions/demo-seed";

export function SeedDemoButton() {
  const router = useRouter();
  const [msg, setMsg] = useState<
    | null
    | { kind: "error"; text: string }
    | { kind: "ok"; slug: string; existed: boolean }
  >(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const r = await seedDemoEngagement();
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setMsg({ kind: "ok", slug: r.slug, existed: r.existed });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white transition-colors disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="w-3.5 h-3.5" aria-hidden />
        )}
        {isPending ? "Building sample…" : "Create sample engagement"}
      </button>

      {msg?.kind === "error" && (
        <p className="text-xs text-tbb-danger">{msg.text}</p>
      )}
      {msg?.kind === "ok" && (
        <p className="text-xs text-tbb-ink-3">
          {msg.existed
            ? "A sample engagement already exists — "
            : "Sample engagement created — "}
          <a
            href={`/portal/e/${msg.slug}`}
            className="font-bold text-tbb-blue hover:underline"
          >
            open its client portal →
          </a>{" "}
          or find &ldquo;Northwind Builders (Demo)&rdquo; in the list below to
          archive or delete it.
        </p>
      )}
    </div>
  );
}
