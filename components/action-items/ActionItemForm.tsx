"use client";

/**
 * Shared create/edit form for action items.
 *
 * - Mode 'create' shows save + cancel.
 * - Mode 'edit' shows save + cancel + delete.
 *
 * Defaults are computed by the server and passed in via initialValues
 * (so the form doesn't need to know about role-based fallback logic).
 *
 * Submission goes through server actions (createActionItem /
 * updateActionItem / deleteActionItem). The form returns to the parent
 * route via router.push on success.
 */

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createActionItem,
  deleteActionItem,
  updateActionItem,
} from "@/lib/actions/action-items";
import {
  STATUS_LABEL,
  type ActionItemStatus,
} from "./utils";

export type ActionItemFormMember = {
  id: string;
  fullName: string;
};

export type ActionItemFormProject = {
  id: string;
  name: string;
};

export type ActionItemFormInitial = {
  title: string;
  description: string;
  status: ActionItemStatus;
  assigneeUserProfileId: string | null;
  // YYYY-MM-DD or empty
  dueDate: string;
  revenueImpact: boolean;
  marginImpact: boolean;
  /** Optional link to the parent project. Null means standalone
   *  (a one-off commitment that isn't part of a larger project). */
  projectId?: string | null;
};

const inputClass =
  "w-full px-3 py-2 border border-tbb-line rounded-md bg-white text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-tbb-blue focus:border-transparent " +
  "font-sans";

const labelClass =
  "block font-sans text-sm font-bold text-foreground mb-1.5";

export function ActionItemForm({
  mode,
  itemId,
  engagementId,
  members,
  projects = [],
  statusOptions,
  initialValues,
  cancelHref,
  successHref,
}: {
  mode: "create" | "edit";
  itemId?: string;
  engagementId: string;
  members: ActionItemFormMember[];
  /** Projects available to nest this action item under. Empty
   *  shows guidance instead of the picker. */
  projects?: ActionItemFormProject[];
  statusOptions: readonly ActionItemStatus[];
  initialValues: ActionItemFormInitial;
  cancelHref: string;
  successHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initialValues.title);
  const [description, setDescription] = useState(initialValues.description);
  const [status, setStatus] = useState<ActionItemStatus>(initialValues.status);
  const [assignee, setAssignee] = useState<string>(
    initialValues.assigneeUserProfileId ?? "",
  );
  const [dueDate, setDueDate] = useState(initialValues.dueDate);
  const [revenueImpact, setRevenueImpact] = useState(initialValues.revenueImpact);
  const [marginImpact, setMarginImpact] = useState(initialValues.marginImpact);
  const [projectId, setProjectId] = useState(initialValues.projectId ?? "");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        assigneeUserProfileId: assignee || null,
        dueDate: dueDate || null,
        revenueImpact,
        marginImpact,
        projectId: projectId || null,
      };

      const result =
        mode === "create"
          ? await createActionItem({ engagementId, ...payload })
          : await updateActionItem(itemId!, payload);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(successHref);
      router.refresh();
    });
  }

  function onDelete() {
    if (!itemId) return;
    if (!confirm("Delete this action item? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteActionItem(itemId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(successHref);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
      <div>
        <label htmlFor="title" className={labelClass}>
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={500}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ship the new pricing page"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Description <span className="font-normal text-muted-foreground">(optional, markdown)</span>
        </label>
        <textarea
          id="description"
          name="description"
          maxLength={10000}
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detail, acceptance criteria, links…"
          className={inputClass + " font-mono text-sm leading-relaxed"}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ActionItemStatus)}
            className={inputClass}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="dueDate" className={labelClass}>
            Due date
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="assignee" className={labelClass}>
          Assignee
        </label>
        <select
          id="assignee"
          name="assignee"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className={inputClass}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </select>
      </div>

      {/* Part of project — nests this action item under a project
          in the engagement Workspace view. Blank means it's a
          one-off commitment, not part of a larger initiative. */}
      <div>
        <label htmlFor="projectId" className={labelClass}>
          Part of project{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        {projects.length === 0 ? (
          <div className="border border-dashed border-tbb-line rounded-md px-3 py-2 text-xs text-tbb-ink-3 italic">
            No projects on this engagement yet. Create a project first
            from the Projects page, then come back here to assign this
            action item to it.
          </div>
        ) : (
          <select
            id="projectId"
            name="projectId"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inputClass}
          >
            <option value="">— One-off (not part of a project) —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <p className="mt-1 font-sans text-xs text-muted-foreground">
          Nesting under a project makes it show up in the right spot on
          the engagement Workspace view.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className={labelClass}>Quality gate</legend>
        <label className="flex items-center gap-3 font-sans text-sm">
          <input
            type="checkbox"
            checked={revenueImpact}
            onChange={(e) => setRevenueImpact(e.target.checked)}
            className="h-4 w-4 accent-[#2E4057]"
          />
          Moves top-line revenue
        </label>
        <label className="flex items-center gap-3 font-sans text-sm">
          <input
            type="checkbox"
            checked={marginImpact}
            onChange={(e) => setMarginImpact(e.target.checked)}
            className="h-4 w-4 accent-[#2E4057]"
          />
          Protects margin
        </label>
      </fieldset>

      {error && (
        <p className="font-sans text-sm border-l-2 border-tbb-danger pl-3 py-1 text-tbb-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="font-sans bg-foreground text-background px-6 py-3 rounded-pill hover:bg-tbb-blue-700 transition-colors uppercase tracking-wider text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : mode === "create" ? "Create" : "Save"}
        </button>
        <a
          href={cancelHref}
          className="font-sans text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
        >
          Cancel
        </a>
        {mode === "edit" && itemId && (
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="ml-auto font-sans text-xs uppercase tracking-tbb-caps text-tbb-danger hover:underline underline-offset-4 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
