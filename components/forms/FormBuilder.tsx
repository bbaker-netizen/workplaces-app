"use client";

/**
 * FormBuilder — minimal schema editor. Each question has type, label,
 * required flag, and (for radio/checkbox) options.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createForm, updateForm, deleteForm } from "@/lib/actions/forms";

type FType = "diagnostic" | "intake" | "pulse" | "nps" | "custom";
type QType = "text" | "textarea" | "radio" | "scale" | "checkbox";

const TYPE_LABEL: Record<FType, string> = {
  diagnostic: "Diagnostic",
  intake: "Intake",
  pulse: "Pulse",
  nps: "NPS",
  custom: "Custom",
};

export type FormQuestion = {
  id: string;
  type: QType;
  label: string;
  required?: boolean;
  options?: string[];
};

export function FormBuilder({
  engagementId,
  initial,
  redirectTo,
  showDelete = false,
}: {
  engagementId: string;
  initial: {
    id?: string;
    name: string;
    description: string;
    type: FType;
    schema: FormQuestion[];
    isActive: boolean;
  };
  redirectTo: string;
  showDelete?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [type, setType] = useState<FType>(initial.type);
  const [questions, setQuestions] = useState<FormQuestion[]>(initial.schema);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const editing = !!initial.id;

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "text",
        label: "",
        required: false,
      },
    ]);
  };

  const updateQuestion = (index: number, patch: Partial<FormQuestion>) => {
    const next = [...questions];
    next[index] = { ...next[index], ...patch };
    setQuestions(next);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const submit = () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    for (const q of questions) {
      if (!q.label.trim()) {
        setError("All questions need a label.");
        return;
      }
    }
    setError(null);
    startTransition(async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        type,
        schema: questions.map((q) => ({
          ...q,
          options:
            q.type === "radio" || q.type === "checkbox"
              ? (q.options ?? []).filter(Boolean)
              : undefined,
        })),
        isActive,
      };
      const result = editing
        ? await updateForm(initial.id!, payload)
        : await createForm({ ...payload, engagementId });
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
        "Delete this form? All submissions on it go too.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deleteForm(initial.id!);
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
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Name
          </span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Type
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FType)}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          >
            {(Object.keys(TYPE_LABEL) as FType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Description
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isPending}
          rows={2}
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057] resize-y"
        />
      </label>

      <fieldset className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <legend className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Questions
          </legend>
          <button
            type="button"
            onClick={addQuestion}
            disabled={isPending}
            className="inline-flex items-center gap-1 font-sans text-xs uppercase tracking-[0.15em] font-bold px-2 py-1 rounded bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50"
          >
            <Plus className="w-3 h-3" aria-hidden /> Add question
          </button>
        </div>
        <ul className="space-y-2">
          {questions.map((q, idx) => (
            <li
              key={q.id}
              className="border border-[#CCCCCC] rounded-md bg-white p-3 space-y-2"
            >
              <div className="grid sm:grid-cols-3 gap-2">
                <select
                  value={q.type}
                  onChange={(e) =>
                    updateQuestion(idx, { type: e.target.value as QType })
                  }
                  disabled={isPending}
                  className="bg-white border border-[#CCCCCC] rounded-md px-2 py-1 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
                >
                  <option value="text">Short text</option>
                  <option value="textarea">Long text</option>
                  <option value="radio">Single choice</option>
                  <option value="checkbox">Multiple choice</option>
                  <option value="scale">Scale (1–10)</option>
                </select>
                <input
                  placeholder="Question label"
                  value={q.label}
                  onChange={(e) =>
                    updateQuestion(idx, { label: e.target.value })
                  }
                  disabled={isPending}
                  className="sm:col-span-2 bg-white border border-[#CCCCCC] rounded-md px-2 py-1 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
                />
              </div>
              {(q.type === "radio" || q.type === "checkbox") && (
                <input
                  placeholder="Options, comma-separated"
                  value={(q.options ?? []).join(", ")}
                  onChange={(e) =>
                    updateQuestion(idx, {
                      options: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  disabled={isPending}
                  className="w-full bg-white border border-[#CCCCCC] rounded-md px-2 py-1 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
                />
              )}
              <div className="flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 font-sans text-xs">
                  <input
                    type="checkbox"
                    checked={!!q.required}
                    onChange={(e) =>
                      updateQuestion(idx, { required: e.target.checked })
                    }
                    disabled={isPending}
                    className="w-3.5 h-3.5 accent-[#2E4057]"
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => removeQuestion(idx)}
                  disabled={isPending}
                  className="font-sans text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-[#E87722] inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" aria-hidden />
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        {questions.length === 0 && (
          <p className="font-sans text-sm text-muted-foreground italic">
            No questions yet. Click Add question to start.
          </p>
        )}
      </fieldset>

      <label className="inline-flex items-center gap-2 font-sans text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={isPending}
          className="w-4 h-4 accent-[#2E4057]"
        />
        Active (accepting responses)
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
            Delete form
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
            {isPending ? "Saving…" : editing ? "Save" : "Create form"}
          </button>
        </div>
      </div>
    </form>
  );
}
