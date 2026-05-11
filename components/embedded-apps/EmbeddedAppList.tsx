"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2, ExternalLink } from "lucide-react";
import {
  createEmbeddedApp,
  deleteEmbeddedApp,
} from "@/lib/actions/embedded-apps";

type App = {
  id: string;
  netlifyProjectId: string;
  displayName: string;
  description: string | null;
  appUrl: string;
  authMode: "public" | "token_passthrough" | "clerk_sso";
  isVisible: boolean;
};

export function EmbeddedAppList({
  engagementId,
  apps,
  isCoach,
}: {
  engagementId: string;
  apps: App[];
  isCoach: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    displayName: "",
    netlifyProjectId: "",
    appUrl: "",
    description: "",
    authMode: "public" as App["authMode"],
  });
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!draft.displayName.trim() || !draft.appUrl.trim()) {
      setError("Display name and URL are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createEmbeddedApp({
        engagementId,
        netlifyProjectId: draft.netlifyProjectId.trim() || draft.appUrl,
        displayName: draft.displayName.trim(),
        description: draft.description.trim() || null,
        appUrl: draft.appUrl.trim(),
        authMode: draft.authMode,
      });
      if (!result.ok) setError(result.error);
      else {
        setAdding(false);
        setDraft({
          displayName: "",
          netlifyProjectId: "",
          appUrl: "",
          description: "",
          authMode: "public",
        });
      }
    });
  };

  const remove = (id: string, name: string) => {
    if (!window.confirm(`Remove "${name}" from the portal?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteEmbeddedApp(id);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="space-y-4">
      {apps.length === 0 && !adding ? (
        <div className="border border-tbb-line rounded-md bg-white p-6">
          <p className="font-sans text-sm text-muted-foreground italic">
            {isCoach
              ? "No apps registered yet. Add one to surface a Netlify-hosted tool right inside the portal."
              : "Your Business Builder hasn't surfaced any apps here yet."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {apps.map((a) => (
            <li
              key={a.id}
              className="border border-tbb-line rounded-md bg-white p-4 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={a.appUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-foreground text-lg tracking-tight hover:underline underline-offset-4 group inline-flex items-center gap-1"
                >
                  {a.displayName}
                  <ExternalLink className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" aria-hidden />
                </Link>
                {isCoach && (
                  <button
                    type="button"
                    onClick={() => remove(a.id, a.displayName)}
                    disabled={isPending}
                    aria-label={`Remove ${a.displayName}`}
                    className="p-1 rounded text-muted-foreground hover:text-tbb-danger hover:bg-tbb-cream-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </button>
                )}
              </div>
              {a.description && (
                <p className="font-sans text-sm text-muted-foreground">
                  {a.description}
                </p>
              )}
              <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                {a.authMode.replace("_", " ")} · {a.isVisible ? "visible" : "hidden"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {isCoach && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
        >
          <Plus className="w-4 h-4" aria-hidden /> Register app
        </button>
      )}

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="border border-tbb-line rounded-md bg-white p-4 space-y-3"
        >
          <h3 className="font-bold text-foreground text-lg tracking-tight">
            Register app
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Display name"
              value={draft.displayName}
              onChange={(e) =>
                setDraft({ ...draft, displayName: e.target.value })
              }
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
            <input
              placeholder="Netlify project ID (optional)"
              value={draft.netlifyProjectId}
              onChange={(e) =>
                setDraft({ ...draft, netlifyProjectId: e.target.value })
              }
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
            <input
              type="url"
              required
              placeholder="https://your-app.netlify.app"
              value={draft.appUrl}
              onChange={(e) => setDraft({ ...draft, appUrl: e.target.value })}
              disabled={isPending}
              className="sm:col-span-2 bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
            <select
              value={draft.authMode}
              onChange={(e) =>
                setDraft({ ...draft, authMode: e.target.value as App["authMode"] })
              }
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            >
              <option value="public">Public (no auth)</option>
              <option value="token_passthrough">Token passthrough</option>
              <option value="clerk_sso">Clerk SSO (Phase 2)</option>
            </select>
          </div>
          <textarea
            placeholder="Short description (what this app does)"
            rows={2}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
          />
          {error && (
            <p
              role="alert"
              className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={isPending}
              className="font-sans text-xs uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              {isPending ? "Saving…" : "Register"}
            </button>
          </div>
        </form>
      )}

      {error && !adding && (
        <p role="alert" className="font-sans text-sm text-tbb-danger">
          {error}
        </p>
      )}
    </div>
  );
}
