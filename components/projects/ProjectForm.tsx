"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createProject, updateProject, deleteProject } from "@/lib/actions/projects";

type ProjectStatus =
  | "planning"
  | "active"
  | "blocked"
  | "completed"
  | "cancelled";

const STATUS_OPTIONS: ReadonlyArray<{ value: ProjectStatus; label: string }> = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export type ProjectFormMember = { id: string; fullName: string };
export type ProjectFormInitial = {
  id?: string;
  name: string;
  description: string;
  status: ProjectStatus;
  leadUserProfileId: string | null;
  startDate: string;
  targetDate: string;
  revenueImpact: boolean;
  marginImpact: boolean;
};

export function ProjectForm({
  engagementId,
  initial,
  members,
  redirectTo,
  showDelete = false,
}: {
  engagementId: string;
  initial: ProjectFormInitial;
  members: ProjectFormMember[];
  redirectTo: string;
  showDelete?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState<ProjectStatus>(initial.status);
  const [leadId, setLeadId] = useState(initial.leadUserProfileId ?? "");
  const [startDate, setStartDate] = useState(initial.startDate);
  const [targetDate, setTargetDate] = useState(initial.targetDate);
  const [revenueImpact, setRevenueImpact] = useState(initial.revenueImpact);
  const [marginImpact, setMarginImpact] = useState(initial.marginImpact);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const editing = !!initial.id;
  const qualityGateOk = revenueImpact || marginImpact;

  const submit = () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!qualityGateOk) {
      setError("Tag at least one of Revenue or Margin impact.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        status,
        leadUserProfileId: leadId || null,
        startDate: startDate || null,
        targetDate: targetDate || null,
        revenueImpact,
        marginImpact,
      };
      const result = editing
        ? await updateProject(initial.id!, payload)
        : await createProject({ ...payload, engagementId });
      if (!result.ok) setError(result.error);
      else {
        router.push(redirectTo);
        router.refresh();
      }
    });
  };

  const onDelete = () => {
    if (!initial.id) return;
    if (
      !window.confirm(
        "Delete this project? All tasks attached to it will go too.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deleteProject(initial.id!);
      if (!result.ok) setError(result.error);
      else {
        router.push(redirectTo);
        router.refresh();
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
      aria-busy={isPending}
    >
      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Name
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={500}
          disabled={isPending}
          placeholder="Hire VP Sales · Q4"
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
      </label>
      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Description (markdown)
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          disabled={isPending}
          placeholder="Why this project, scope, success criteria…"
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
        />
      </label>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Status
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Lead
          </span>
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Start date
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Target date
          </span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </label>
      </div>

      <fieldset className="border border-tbb-line rounded-md p-3 space-y-2">
        <legend className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground px-1">
          Quality gate (pick at least one)
        </legend>
        <label className="flex items-center gap-2 font-sans text-sm">
          <input
            type="checkbox"
            checked={revenueImpact}
            onChange={(e) => setRevenueImpact(e.target.checked)}
            disabled={isPending}
            className="w-4 h-4 accent-[#2E4057]"
          />
          <span>Moves <strong>top-line revenue</strong></span>
        </label>
        <label className="flex items-center gap-2 font-sans text-sm">
          <input
            type="checkbox"
            checked={marginImpact}
            onChange={(e) => setMarginImpact(e.target.checked)}
            disabled={isPending}
            className="w-4 h-4 accent-[#2E4057]"
          />
          <span>Protects <strong>margin</strong></span>
        </label>
      </fieldset>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {showDelete && initial.id && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="font-sans text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-tbb-danger underline-offset-4 hover:underline"
          >
            Delete project
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(redirectTo)}
            disabled={isPending}
            className="font-sans text-xs uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isPending ? "Saving…" : editing ? "Save" : "Create project"}
          </button>
        </div>
      </div>
    </form>
  );
}
