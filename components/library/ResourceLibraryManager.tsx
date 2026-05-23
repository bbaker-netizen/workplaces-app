"use client";

/**
 * Resource Library UI — filter pills by type, card grid, in-place
 * add/edit drawer. Designed for fast capture: paste a URL, give it a
 * title, tag it, save.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  FileText,
  Hammer,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Play,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  createResource,
  deleteResource,
  updateResource,
} from "@/lib/actions/resources";

type ResourceType = "tool" | "video" | "document" | "link";

type Resource = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  url: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  audience: string;
  isPublished: boolean;
  updatedAt: Date;
};

type Draft = {
  id: string | null;
  title: string;
  description: string;
  type: ResourceType;
  url: string;
  thumbnailUrl: string;
  tagsInput: string;
  audience: "coach_only" | "client" | "public";
  isPublished: boolean;
};

const TYPE_META: Record<
  ResourceType,
  { label: string; icon: typeof Hammer; chipBg: string }
> = {
  tool: {
    label: "Tool",
    icon: Hammer,
    chipBg: "bg-tbb-blue text-white",
  },
  video: {
    label: "Video",
    icon: Play,
    chipBg: "bg-tbb-success text-white",
  },
  document: {
    label: "Document",
    icon: FileText,
    chipBg: "bg-tbb-navy text-white",
  },
  link: {
    label: "Link",
    icon: LinkIcon,
    chipBg: "bg-tbb-ink-3 text-white",
  },
};

const NEW_DRAFT: Draft = {
  id: null,
  title: "",
  description: "",
  type: "video",
  url: "",
  thumbnailUrl: "",
  tagsInput: "",
  audience: "coach_only",
  isPublished: true,
};

function detectType(t: string): t is ResourceType {
  return t === "tool" || t === "video" || t === "document" || t === "link";
}

export function ResourceLibraryManager({
  initial,
}: {
  initial: Resource[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | ResourceType>("all");
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initial.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [initial, typeFilter, query]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: initial.length };
    for (const r of initial) map[r.type] = (map[r.type] ?? 0) + 1;
    return map;
  }, [initial]);

  function openNew(type?: ResourceType) {
    setError(null);
    setDraft({ ...NEW_DRAFT, type: type ?? "video" });
  }

  function openEdit(r: Resource) {
    setError(null);
    setDraft({
      id: r.id,
      title: r.title,
      description: r.description ?? "",
      type: detectType(r.type) ? r.type : "document",
      url: r.url ?? "",
      thumbnailUrl: r.thumbnailUrl ?? "",
      tagsInput: r.tags.join(", "),
      audience:
        r.audience === "client" || r.audience === "public"
          ? r.audience
          : "coach_only",
      isPublished: r.isPublished,
    });
  }

  function save() {
    if (!draft) return;
    setError(null);
    const tags = draft.tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    startTransition(async () => {
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        type: draft.type,
        url: draft.url.trim() || null,
        thumbnailUrl: draft.thumbnailUrl.trim() || null,
        tags,
        audience: draft.audience,
        isPublished: draft.isPublished,
      };
      const r = draft.id
        ? await updateResource(draft.id, payload)
        : await createResource(payload);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this resource? It'll be removed from your library."))
      return;
    startTransition(async () => {
      const r = await deleteResource(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (draft?.id === id) setDraft(null);
      router.refresh();
    });
  }

  const filterPills: Array<{ key: "all" | ResourceType; label: string }> = [
    { key: "all", label: "All" },
    { key: "tool", label: "Tools" },
    { key: "video", label: "Videos" },
    { key: "document", label: "Documents" },
    { key: "link", label: "Links" },
  ];

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 flex-wrap">
          {filterPills.map((p) => {
            const active = typeFilter === p.key;
            const count = counts[p.key] ?? 0;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setTypeFilter(p.key)}
                className={
                  "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border transition-colors " +
                  (active
                    ? "bg-tbb-navy text-white border-tbb-navy"
                    : "bg-white text-tbb-navy border-tbb-line hover:border-tbb-blue")
                }
              >
                {p.label}
                <span
                  className={
                    "tabular-nums px-1.5 py-0 rounded-pill text-[10px] " +
                    (active
                      ? "bg-white/20 text-white"
                      : "bg-tbb-cream-50 text-tbb-ink-3")
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, description, tags…"
          className="flex-1 min-w-[200px] max-w-md bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
        <button
          type="button"
          onClick={() => openNew()}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden /> Add resource
        </button>
      </div>

      {error && (
        <p className="text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50">
          {error}
        </p>
      )}

      {/* Draft editor */}
      {draft && (
        <div className="border border-tbb-line rounded-lg bg-white p-5 space-y-4 shadow-tbb-sm">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              {draft.id ? "Edit resource" : "New resource"}
            </h3>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="ml-auto text-tbb-ink-3 hover:text-tbb-navy"
              aria-label="Close editor"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
          <div className="grid sm:grid-cols-[120px_1fr] gap-4">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Type
              </span>
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft({ ...draft, type: e.target.value as ResourceType })
                }
                disabled={isPending}
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              >
                <option value="tool">Tool</option>
                <option value="video">Video</option>
                <option value="document">Document</option>
                <option value="link">Link</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Title
              </span>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                disabled={isPending}
                placeholder="Cash Flow Generator"
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              URL{" "}
              {draft.type === "video" && (
                <span className="font-normal text-tbb-ink-3 normal-case tracking-normal">
                  (YouTube / Loom / Vimeo)
                </span>
              )}
              {draft.type === "tool" && (
                <span className="font-normal text-tbb-ink-3 normal-case tracking-normal">
                  (deployed app URL)
                </span>
              )}
            </span>
            <input
              type="url"
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              disabled={isPending}
              placeholder="https://"
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Description
            </span>
            <textarea
              rows={3}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              disabled={isPending}
              placeholder="What this resource is for. Who's it useful to."
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
            />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Tags (comma-separated)
              </span>
              <input
                type="text"
                value={draft.tagsInput}
                onChange={(e) =>
                  setDraft({ ...draft, tagsInput: e.target.value })
                }
                disabled={isPending}
                placeholder="cash flow, finance, onboarding"
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Thumbnail URL (optional)
              </span>
              <input
                type="url"
                value={draft.thumbnailUrl}
                onChange={(e) =>
                  setDraft({ ...draft, thumbnailUrl: e.target.value })
                }
                disabled={isPending}
                placeholder="https://"
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending || !draft.title.trim()}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <Save className="w-3.5 h-3.5" aria-hidden />
              )}
              {draft.id ? "Save changes" : "Add to library"}
            </button>
            {draft.id && (
              <button
                type="button"
                onClick={() => remove(draft.id!)}
                disabled={isPending}
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-danger hover:bg-tbb-danger/10 px-2.5 py-1.5 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden /> Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="border border-dashed border-tbb-line rounded-lg bg-white p-10 text-center space-y-2">
          <Hammer className="w-8 h-8 text-tbb-blue mx-auto" aria-hidden />
          <p className="font-bold text-tbb-navy">
            {initial.length === 0
              ? "Library's empty. Add your first resource."
              : "No resources match this filter."}
          </p>
          {initial.length === 0 && (
            <p className="text-sm text-tbb-ink-3 max-w-md mx-auto">
              Drop in a tool URL, a Loom tutorial, or a how-to doc — anything
              you want to keep one click away for yourself, Jen, or your
              clients.
            </p>
          )}
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => {
            const type = detectType(r.type) ? r.type : "document";
            const meta = TYPE_META[type];
            const Icon = meta.icon;
            return (
              <li
                key={r.id}
                className="border border-tbb-line rounded-lg bg-white overflow-hidden shadow-tbb-sm hover:shadow-tbb-md transition-shadow flex flex-col"
              >
                {r.thumbnailUrl && (
                  <div className="aspect-video bg-tbb-cream-50 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4 space-y-2 flex-1 flex flex-col">
                  <div className="flex items-start gap-2">
                    <span
                      className={
                        "inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-tbb-caps px-1.5 py-0.5 rounded-pill " +
                        meta.chipBg
                      }
                    >
                      <Icon className="w-3 h-3" aria-hidden />
                      {meta.label}
                    </span>
                    {!r.isPublished && (
                      <span className="text-[9px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 bg-tbb-cream-50 border border-tbb-line px-1.5 py-0.5 rounded-pill">
                        Draft
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-tbb-navy leading-tight">
                    {r.title}
                  </h3>
                  {r.description && (
                    <p className="text-xs text-tbb-ink-2 leading-snug line-clamp-3">
                      {r.description}
                    </p>
                  )}
                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-auto pt-1">
                      {r.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] text-tbb-ink-3 bg-tbb-cream-50 border border-tbb-line-soft px-1.5 py-0 rounded-pill"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2 mt-auto border-t border-tbb-line-soft">
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
                      >
                        Open <ExternalLink className="w-3 h-3" aria-hidden />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
                    >
                      <Pencil className="w-3 h-3" aria-hidden /> Edit
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
