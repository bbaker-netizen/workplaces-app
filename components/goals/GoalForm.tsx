"use client";

/**
 * GoalForm — create OR edit a goal. Same shape both ways.
 *
 * Quality Gate: at least one of revenue_impact / margin_impact must
 * be checked. Server enforces it; the form surfaces a hint.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  createGoal,
  updateGoal,
  deleteGoal,
} from "@/lib/actions/goals";

type GoalStatus =
  | "open"
  | "in_progress"
  | "achieved"
  | "missed"
  | "abandoned";

const STATUS_OPTIONS: ReadonlyArray<{ value: GoalStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "achieved", label: "Achieved" },
  { value: "missed", label: "Missed" },
  { value: "abandoned", label: "Abandoned" },
];

export type GoalFormMember = { id: string; fullName: string };

export type GoalFormInitial = {
  id?: string; // present for edit
  title: string;
  description: string;
  targetMetric: string;
  targetValue: string;
  targetDate: string; // YYYY-MM-DD or ""
  status: GoalStatus;
  revenueImpact: boolean;
  marginImpact: boolean;
  ownerUserProfileId: string | null;
};

export function GoalForm({
  engagementId,
  initial,
  members,
  redirectTo,
  showDelete = false,
}: {
  engagementId: string;
  initial: GoalFormInitial;
  members: GoalFormMember[];
  redirectTo: string;
  showDelete?: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [targetMetric, setTargetMetric] = useState(initial.targetMetric);
  const [targetValue, setTargetValue] = useState(initial.targetValue);
  const [targetDate, setTargetDate] = useState(initial.targetDate);
  const [status, setStatus] = useState<GoalStatus>(initial.status);
  const [revenueImpact, setRevenueImpact] = useState(initial.revenueImpact);
  const [marginImpact, setMarginImpact] = useState(initial.marginImpact);
  const [ownerId, setOwnerId] = useState(initial.ownerUserProfileId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editing = !!initial.id;
  const qualityGateOk = revenueImpact || marginImpact;

  const submit = () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!qualityGateOk) {
      setError(
        "Tag at least one of Revenue impact or Margin impact — every goal must move one or both.",
      );
      return;
    }
    setError(null);
    startTransition(async () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        targetMetric: targetMetric.trim() || null,
        targetValue: targetValue.trim() || null,
        targetDate: targetDate || null,
        status,
        revenueImpact,
        marginImpact,
        ownerUserProfileId: ownerId || null,
      };
      const result = editing
        ? await updateGoal(initial.id!, payload)
        : await createGoal({ ...payload, engagementId });
      if (!result.ok) {
        setError(result.error);
      } else {
        router.push(redirectTo);
        router.refresh();
      }
    });
  };

  const onDelete = () => {
    if (!initial.id) return;
    if (
      !window.confirm("Delete this goal? This can't be undone.")
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deleteGoal(initial.id!);
      if (!result.ok) {
        setError(result.error);
      } else {
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
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Title
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPending}
          required
          maxLength={500}
          placeholder="Reach $1.2M ARR by Q4"
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
        />
      </label>

      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Description (markdown supported)
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isPending}
          rows={5}
          placeholder="Why this goal, the SMART breakdown, who owns each part…"
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057] resize-y"
        />
      </label>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Target metric
          </span>
          <input
            type="text"
            value={targetMetric}
            onChange={(e) => setTargetMetric(e.target.value)}
            disabled={isPending}
            placeholder="e.g. Q4 ARR, Gross margin %"
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Target value
          </span>
          <input
            type="text"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            disabled={isPending}
            placeholder="e.g. $1.2M, 22%"
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Target date
          </span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          />
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Status
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as GoalStatus)}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Owner
          </span>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
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

      <fieldset className="border border-[#CCCCCC] rounded-md p-3 space-y-2">
        <legend className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground px-1">
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
        {!qualityGateOk && (
          <p className="font-sans text-xs text-[#E87722]">
            Goals that don&apos;t move revenue or margin shouldn&apos;t exist.
          </p>
        )}
      </fieldset>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
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
            className="font-sans text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-[#E87722] underline-offset-4 hover:underline"
          >
            Delete goal
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(redirectTo)}
            disabled={isPending}
            className="font-sans text-xs uppercase tracking-[0.15em] px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50 disabled:cursor-wait"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isPending ? "Saving…" : editing ? "Save" : "Create goal"}
          </button>
        </div>
      </div>
    </form>
  );
}
