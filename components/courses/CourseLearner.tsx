"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import {
  markLessonComplete,
  unmarkLessonComplete,
} from "@/lib/actions/courses";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

type Lesson = {
  id: string;
  title: string;
  body: string | null;
  orderIndex: number;
  completedAt: Date | null;
};

export function CourseLearner({ lessons }: { lessons: Lesson[] }) {
  const [doneIds, setDoneIds] = useState<Set<string>>(
    () => new Set(lessons.filter((l) => l.completedAt).map((l) => l.id)),
  );
  const [activeId, setActiveId] = useState<string | null>(
    () =>
      lessons.find((l) => !l.completedAt)?.id ?? lessons[0]?.id ?? null,
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (lessons.length === 0) {
    return (
      <p className="font-sans text-sm text-muted-foreground italic border border-[#CCCCCC] rounded-md bg-white p-6">
        No lessons published yet.
      </p>
    );
  }

  const total = lessons.length;
  const done = doneIds.size;
  const pct = Math.round((done / total) * 100);

  const toggle = (lessonId: string) => {
    const wasDone = doneIds.has(lessonId);
    const next = new Set(doneIds);
    if (wasDone) next.delete(lessonId);
    else next.add(lessonId);
    setDoneIds(next);
    setPendingId(lessonId);
    startTransition(async () => {
      const result = wasDone
        ? await unmarkLessonComplete(lessonId)
        : await markLessonComplete(lessonId);
      if (!result.ok) {
        // Revert on failure.
        const reverted = new Set(doneIds);
        if (wasDone) reverted.add(lessonId);
        else reverted.delete(lessonId);
        setDoneIds(reverted);
      }
      setPendingId(null);
    });
  };

  const active = lessons.find((l) => l.id === activeId) ?? lessons[0];

  return (
    <div className="space-y-6">
      <div className="border border-[#CCCCCC] rounded-md bg-white p-4 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Progress
          </h2>
          <span className="font-display font-bold text-foreground text-lg tracking-tight">
            {done}/{total}{" "}
            <span className="font-mono text-xs text-muted-foreground">
              ({pct}%)
            </span>
          </span>
        </div>
        <div className="h-1.5 bg-[#F5F1E8] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#2E4057] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_2fr] gap-6">
        <nav className="border border-[#CCCCCC] rounded-md bg-white">
          <ul className="divide-y divide-[#CCCCCC]">
            {lessons.map((lesson, i) => {
              const isDone = doneIds.has(lesson.id);
              const isActive = lesson.id === activeId;
              return (
                <li key={lesson.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(lesson.id)}
                    className={
                      "w-full text-left px-3 py-2 flex items-center gap-2 group hover:bg-[#F5F1E8] " +
                      (isActive ? "bg-[#F5F1E8]" : "")
                    }
                  >
                    {isDone ? (
                      <CheckCircle2
                        className="w-4 h-4 text-[#2E4057] flex-shrink-0"
                        aria-hidden
                      />
                    ) : (
                      <Circle
                        className="w-4 h-4 text-muted-foreground flex-shrink-0"
                        aria-hidden
                      />
                    )}
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={
                        "font-sans text-sm " +
                        (isActive
                          ? "font-bold text-foreground"
                          : "text-foreground")
                      }
                    >
                      {lesson.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {active && (
          <article className="border border-[#CCCCCC] rounded-md bg-white p-5 space-y-4">
            <header className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="font-display font-bold text-foreground text-xl tracking-tight">
                {active.title}
              </h2>
              <button
                type="button"
                onClick={() => toggle(active.id)}
                disabled={pendingId === active.id}
                className={
                  "inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-[0.15em] font-bold px-3 py-1.5 rounded-md border transition-colors " +
                  (doneIds.has(active.id)
                    ? "bg-[#2E4057] text-[#F5F1E8] border-[#2E4057] hover:bg-[#1A1A1A]"
                    : "bg-white text-foreground border-[#CCCCCC] hover:bg-[#F5F1E8]")
                }
              >
                {pendingId === active.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                ) : doneIds.has(active.id) ? (
                  <CheckCircle2 className="w-3 h-3" aria-hidden />
                ) : (
                  <Circle className="w-3 h-3" aria-hidden />
                )}
                {doneIds.has(active.id) ? "Completed" : "Mark complete"}
              </button>
            </header>
            {active.body ? (
              <MarkdownBody body={active.body} />
            ) : (
              <p className="font-sans text-sm text-muted-foreground italic">
                No content for this lesson yet.
              </p>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
