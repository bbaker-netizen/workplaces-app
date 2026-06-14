"use client";

/**
 * Per-client embedded-apps manager. Assigns a synced Netlify project to
 * a client's portal (an iframe widget) and lists/removes existing ones.
 * Lives on the client's engagement profile, beside the module toggles.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Puzzle, Trash2 } from "lucide-react";
import {
  createEmbeddedApp,
  deleteEmbeddedApp,
} from "@/lib/actions/embedded-apps";

export type EngagementApp = {
  id: string;
  displayName: string;
  appUrl: string;
  authMode: string;
};

export type NetlifyProjectOption = {
  id: string;
  name: string;
  url: string;
};

export function EmbeddedAppManager({
  engagementId,
  apps,
  netlifyProjects,
}: {
  engagementId: string;
  apps: EngagementApp[];
  netlifyProjects: NetlifyProjectOption[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [authMode, setAuthMode] = useState("public");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const available = netlifyProjects;

  function add() {
    setError(null);
    const project = netlifyProjects.find((p) => p.id === projectId);
    if (!project) {
      setError("Pick a Netlify project first.");
      return;
    }
    startTransition(async () => {
      const r = await createEmbeddedApp({
        engagementId,
        netlifyProjectId: project.id,
        displayName: project.name,
        appUrl: project.url,
        instructions: instructions.trim() || null,
        // @ts-expect-error auth mode is a runtime-validated enum string
        authMode,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAdding(false);
      setProjectId("");
      setAuthMode("public");
      setInstructions("");
      router.refresh();
    });
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`Remove "${name}" from this client's portal?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteEmbeddedApp(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {apps.length > 0 ? (
        <ul className="space-y-1.5">
          {apps.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-tbb-line bg-white"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Puzzle className="w-4 h-4 text-tbb-blue shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-tbb-navy truncate">
                    {a.displayName}
                  </span>
                  <span className="block text-xs text-tbb-ink-3 truncate">
                    {a.appUrl} · {a.authMode.replace(/_/g, " ")}
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(a.id, a.displayName)}
                disabled={isPending}
                className="text-tbb-ink-3 hover:text-tbb-danger disabled:opacity-50"
                aria-label={`Remove ${a.displayName}`}
              >
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-tbb-ink-3 italic">
          No apps in this client&apos;s portal yet.
        </p>
      )}

      {adding ? (
        <div className="space-y-2 border border-tbb-line rounded-md p-3 bg-tbb-cream-50">
          {available.length === 0 ? (
            <p className="text-xs text-tbb-ink-3">
              No Netlify projects synced yet. Sync them first under{" "}
              <span className="font-bold">Tools &amp; tutorials</span>.
            </p>
          ) : (
            <>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Netlify project
                </span>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={isPending}
                  className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                >
                  <option value="">Pick a project…</option>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Access
                </span>
                <select
                  value={authMode}
                  onChange={(e) => setAuthMode(e.target.value)}
                  disabled={isPending}
                  className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                >
                  <option value="public">Public (anyone with the link)</option>
                  <option value="token_passthrough">
                    Signed token (app validates a Builder token)
                  </option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  How to use / install (optional)
                </span>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  disabled={isPending}
                  rows={3}
                  placeholder="Markdown. e.g. how to bookmark it, add to the home screen, or install as a desktop app. The client sees this in their portal."
                  className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
                />
              </label>
            </>
          )}
          <div className="flex items-center gap-2">
            {available.length > 0 && (
              <button
                type="button"
                onClick={add}
                disabled={isPending || !projectId}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="w-3.5 h-3.5" aria-hidden />
                )}
                Add to portal
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              disabled={isPending}
              className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden /> Add an app
        </button>
      )}

      {error && <p className="text-sm text-tbb-danger">{error}</p>}
    </div>
  );
}
