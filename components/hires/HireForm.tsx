"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createHire, updateHire, deleteHire } from "@/lib/actions/hires";

type HireStatus =
  | "assessing"
  | "interview_scheduled"
  | "decision_pending"
  | "offer_sent"
  | "hired"
  | "declined";

const STATUS_OPTIONS: ReadonlyArray<{ value: HireStatus; label: string }> = [
  { value: "assessing", label: "Assessing" },
  { value: "interview_scheduled", label: "Interview scheduled" },
  { value: "decision_pending", label: "Decision pending" },
  { value: "offer_sent", label: "Offer sent" },
  { value: "hired", label: "Hired" },
  { value: "declined", label: "Declined" },
];

export type HireFormInitial = {
  id?: string;
  candidateName: string;
  candidateEmail: string;
  roleName: string;
  status: HireStatus;
  notes: string;
};

export function HireForm({
  engagementId,
  initial,
  redirectTo,
  showDelete = false,
}: {
  engagementId: string;
  initial: HireFormInitial;
  redirectTo: string;
  showDelete?: boolean;
}) {
  const router = useRouter();
  const [candidateName, setCandidateName] = useState(initial.candidateName);
  const [candidateEmail, setCandidateEmail] = useState(initial.candidateEmail);
  const [roleName, setRoleName] = useState(initial.roleName);
  const [status, setStatus] = useState<HireStatus>(initial.status);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const editing = !!initial.id;

  const submit = () => {
    if (!candidateName.trim()) {
      setError("Candidate name is required.");
      return;
    }
    if (!roleName.trim()) {
      setError("Role name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const payload = {
        candidateName: candidateName.trim(),
        candidateEmail: candidateEmail.trim() || null,
        roleName: roleName.trim(),
        status,
        notes: notes.trim() || null,
      };
      const result = editing
        ? await updateHire(initial.id!, payload)
        : await createHire({ ...payload, engagementId });
      if (!result.ok) setError(result.error);
      else {
        router.push(redirectTo);
        router.refresh();
      }
    });
  };

  const onDelete = () => {
    if (!initial.id) return;
    if (!window.confirm("Delete this candidate?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteHire(initial.id!);
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
      className="space-y-4"
      aria-busy={isPending}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Candidate name
          </span>
          <input
            type="text"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            required
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Email
          </span>
          <input
            type="email"
            value={candidateEmail}
            onChange={(e) => setCandidateEmail(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          />
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Role
          </span>
          <input
            type="text"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            required
            disabled={isPending}
            placeholder="e.g. VP Sales, Office Manager"
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Status
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as HireStatus)}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Notes (markdown)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={6}
          disabled={isPending}
          placeholder="Strengths, gaps, decision rationale…"
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057] resize-y"
        />
      </label>

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
            Delete candidate
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
            className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isPending ? "Saving…" : editing ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </form>
  );
}
