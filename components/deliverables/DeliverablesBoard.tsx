"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2, Download } from "lucide-react";
import {
  createDeliverable,
  deleteDeliverable,
  updateDeliverable,
} from "@/lib/actions/deliverables";

type DType =
  | "sop"
  | "org_chart"
  | "job_profile"
  | "financial_dashboard"
  | "onboarding_guide"
  | "operations_setup_guide"
  | "business_plan"
  | "marketing_plan"
  | "stages_of_growth_assessment";

type DStatus =
  | "not_started"
  | "in_progress"
  | "review"
  | "delivered"
  | "archived";

const TYPE_LABEL: Record<DType, string> = {
  sop: "SOPs & process flows",
  org_chart: "Org chart",
  job_profile: "Job profile & interview guide",
  financial_dashboard: "Financial dashboard",
  onboarding_guide: "Onboarding guide",
  operations_setup_guide: "Operations setup guide",
  business_plan: "Business plan",
  marketing_plan: "Marketing plan",
  stages_of_growth_assessment: "Stages of growth assessment",
};

const STATUS_LABEL: Record<DStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  review: "In review",
  delivered: "Delivered",
  archived: "Archived",
};

const STATUS_TONE: Record<DStatus, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-foreground",
  review: "text-tbb-navy font-bold",
  delivered: "text-tbb-navy font-bold",
  archived: "text-muted-foreground line-through",
};

type Item = {
  id: string;
  type: DType;
  title: string;
  description: string | null;
  status: DStatus;
  documentId: string | null;
  deliveredAt: Date | null;
};

export function DeliverablesBoard({
  engagementId,
  items,
  canEdit,
}: {
  engagementId: string;
  items: Item[];
  canEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ type: DType; title: string }>({
    type: "sop",
    title: "",
  });

  const onChangeStatus = (id: string, next: DStatus) => {
    setError(null);
    startTransition(async () => {
      const result = await updateDeliverable(id, { status: next });
      if (!result.ok) setError(result.error);
    });
  };

  const submit = () => {
    if (!draft.title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createDeliverable({
        engagementId,
        type: draft.type,
        title: draft.title.trim(),
      });
      if (!result.ok) setError(result.error);
      else {
        setAdding(false);
        setDraft({ type: "sop", title: "" });
      }
    });
  };

  const remove = (id: string, title: string) => {
    if (!window.confirm(`Delete deliverable "${title}"?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteDeliverable(id);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="space-y-6">
      {items.length === 0 && !adding ? (
        <div className="border border-tbb-line rounded-md bg-white p-6 space-y-2">
          <p className="font-bold text-foreground text-base tracking-tight">
            No deliverables tracked yet
          </p>
          <p className="font-sans text-sm text-muted-foreground">
            {canEdit
              ? "Add the first deliverable. They&apos;re grouped by status as they move through the pipeline."
              : "Your coach will track deliverables here."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
          {items.map((d) => (
            <li key={d.id} className="py-3 flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                  <span className="font-bold text-foreground text-base tracking-tight">
                    {d.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {TYPE_LABEL[d.type]}
                  </span>
                </div>
                {d.description && (
                  <p className="mt-0.5 font-sans text-sm text-muted-foreground line-clamp-2">
                    {d.description}
                  </p>
                )}
                {d.deliveredAt && (
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    Delivered {new Date(d.deliveredAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              {d.documentId && (
                <Link
                  href={`/api/documents/${d.documentId}/download`}
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-navy hover:underline"
                >
                  <Download className="w-3 h-3" aria-hidden /> File
                </Link>
              )}
              {canEdit ? (
                <select
                  value={d.status}
                  onChange={(e) => onChangeStatus(d.id, e.target.value as DStatus)}
                  disabled={isPending}
                  className={
                    "font-mono text-[10px] uppercase tracking-tbb-caps bg-white border rounded-full px-2 py-1 cursor-pointer " +
                    (STATUS_TONE[d.status] ?? "")
                  }
                >
                  {(Object.keys(STATUS_LABEL) as DStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className={
                    "font-mono text-[10px] uppercase tracking-tbb-caps " +
                    (STATUS_TONE[d.status] ?? "text-muted-foreground")
                  }
                >
                  {STATUS_LABEL[d.status]}
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(d.id, d.title)}
                  disabled={isPending}
                  aria-label={`Delete ${d.title}`}
                  className="p-1.5 rounded text-muted-foreground hover:text-tbb-danger hover:bg-tbb-cream-50"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
        >
          <Plus className="w-4 h-4" aria-hidden /> Add deliverable
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
            Track a deliverable
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <select
              value={draft.type}
              onChange={(e) =>
                setDraft({ ...draft, type: e.target.value as DType })
              }
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            >
              {(Object.keys(TYPE_LABEL) as DType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="Title (e.g. Sales SOP v1)"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
          </div>
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
              {isPending ? "Saving…" : "Save"}
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
