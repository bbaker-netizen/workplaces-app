"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { submitForm } from "@/lib/actions/forms";
import type { FormQuestion } from "@/lib/db/queries/forms";

export function FormResponder({
  formId,
  questions,
}: {
  formId: string;
  questions: FormQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const setAnswer = (id: string, val: unknown) =>
    setAnswers({ ...answers, [id]: val });

  const submit = () => {
    for (const q of questions) {
      if (q.required && (answers[q.id] === undefined || answers[q.id] === "")) {
        setError(`"${q.label}" is required.`);
        return;
      }
    }
    setError(null);
    startTransition(async () => {
      const result = await submitForm({ formId, answers });
      if (!result.ok) setError(result.error);
      else {
        setSuccess(true);
        setAnswers({});
      }
    });
  };

  if (questions.length === 0) {
    return (
      <p className="font-sans text-sm text-muted-foreground italic">
        This form has no questions yet.
      </p>
    );
  }

  if (success) {
    return (
      <div className="border border-tbb-blue rounded-md bg-tbb-cream-50 p-4 font-sans text-sm">
        Thanks — your response was recorded.
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
      aria-busy={isPending}
    >
      {questions.map((q) => (
        <fieldset key={q.id} className="space-y-2">
          <legend className="font-sans text-sm font-bold text-foreground">
            {q.label}
            {q.required && <span className="text-tbb-danger"> *</span>}
          </legend>
          {q.type === "text" && (
            <input
              type="text"
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              disabled={isPending}
              className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
          )}
          {q.type === "textarea" && (
            <textarea
              rows={4}
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              disabled={isPending}
              className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
            />
          )}
          {q.type === "scale" && (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={(answers[q.id] as number) ?? 5}
                onChange={(e) => setAnswer(q.id, Number(e.target.value))}
                disabled={isPending}
                className="flex-1 accent-[#2E4057]"
              />
              <span className="font-mono text-sm tabular-nums w-8 text-right">
                {(answers[q.id] as number) ?? 5}
              </span>
            </div>
          )}
          {q.type === "radio" && (
            <div className="space-y-1">
              {(q.options ?? []).map((opt) => (
                <label key={opt} className="flex items-center gap-2 font-sans text-sm">
                  <input
                    type="radio"
                    name={q.id}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswer(q.id, opt)}
                    disabled={isPending}
                    className="w-4 h-4 accent-[#2E4057]"
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}
          {q.type === "checkbox" && (
            <div className="space-y-1">
              {(q.options ?? []).map((opt) => {
                const arr = (answers[q.id] as string[]) ?? [];
                return (
                  <label key={opt} className="flex items-center gap-2 font-sans text-sm">
                    <input
                      type="checkbox"
                      checked={arr.includes(opt)}
                      onChange={(e) => {
                        if (e.target.checked) setAnswer(q.id, [...arr, opt]);
                        else
                          setAnswer(
                            q.id,
                            arr.filter((v) => v !== opt),
                          );
                      }}
                      disabled={isPending}
                      className="w-4 h-4 accent-[#2E4057]"
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      ))}
      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {isPending ? "Submitting…" : "Submit"}
        </button>
      </div>
    </form>
  );
}
