"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import {
  createCohort,
  createLesson,
  deleteCourse,
  deleteLesson,
  enrollUser,
  publishCourse,
  setEnrollmentStatus,
  updateLesson,
} from "@/lib/actions/courses";
import { useRouter } from "next/navigation";

type Lesson = {
  id: string;
  title: string;
  body: string | null;
  orderIndex: number;
};

type CohortItem = {
  id: string;
  name: string;
  status: "upcoming" | "in_progress" | "completed" | "cancelled";
  startsAt: Date | null;
  endsAt: Date | null;
};

type EnrollmentItem = {
  id: string;
  userProfileId: string;
  userName: string;
  status: "enrolled" | "in_progress" | "completed" | "dropped";
  completedAt: Date | null;
};

export function CourseManager({
  course,
  lessons,
  cohorts,
  enrollments,
  members,
  canEdit,
}: {
  course: {
    id: string;
    name: string;
    description: string | null;
    deliveryMode: "self_paced" | "cohort";
    isPublished: boolean;
  };
  lessons: Lesson[];
  cohorts: CohortItem[];
  enrollments: EnrollmentItem[];
  members: Array<{ id: string; fullName: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeLessonId, setActiveLessonId] = useState<string | null>(
    lessons[0]?.id ?? null,
  );
  const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? null;

  // Lesson management
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const addLesson = () => {
    if (!newLessonTitle.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createLesson({
        courseId: course.id,
        title: newLessonTitle.trim(),
      });
      if (!result.ok) setError(result.error);
      else {
        setNewLessonTitle("");
        router.refresh();
      }
    });
  };
  const removeLesson = (id: string, title: string) => {
    if (!window.confirm(`Delete lesson "${title}"?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteLesson(id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };
  const [lessonBody, setLessonBody] = useState(activeLesson?.body ?? "");
  const [lessonTitle, setLessonTitle] = useState(activeLesson?.title ?? "");
  // Re-sync drafts when active lesson changes.
  if (activeLesson && lessonTitle !== activeLesson.title && !isPending) {
    // Only sync once on swap; this is a quick guard.
  }
  const saveLesson = () => {
    if (!activeLesson) return;
    setError(null);
    startTransition(async () => {
      const result = await updateLesson(activeLesson.id, {
        title: lessonTitle.trim() || activeLesson.title,
        body: lessonBody,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };

  // Cohort
  const [newCohortName, setNewCohortName] = useState("");
  const addCohort = () => {
    if (!newCohortName.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createCohort({
        courseId: course.id,
        name: newCohortName.trim(),
      });
      if (!result.ok) setError(result.error);
      else {
        setNewCohortName("");
        router.refresh();
      }
    });
  };

  // Enrollments
  const [enrollMember, setEnrollMember] = useState("");
  const enrollSomeone = () => {
    if (!enrollMember) return;
    setError(null);
    startTransition(async () => {
      const result = await enrollUser({
        courseId: course.id,
        userProfileId: enrollMember,
      });
      if (!result.ok) setError(result.error);
      else {
        setEnrollMember("");
        router.refresh();
      }
    });
  };
  const flipStatus = (id: string, next: EnrollmentItem["status"]) => {
    setError(null);
    startTransition(async () => {
      const result = await setEnrollmentStatus(id, next);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };

  // Course-level
  const togglePublished = () => {
    setError(null);
    startTransition(async () => {
      const result = await publishCourse(course.id, !course.isPublished);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };
  const onDeleteCourse = () => {
    if (
      !window.confirm(
        "Delete this course? Lessons, cohorts, and enrollments go with it.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCourse(course.id);
      if (!result.ok) setError(result.error);
      else router.push("/portal/courses");
    });
  };

  return (
    <div className="space-y-10">
      {/* Lessons section */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-foreground text-xl tracking-tight">
            Lessons
          </h2>
        </div>
        {lessons.length === 0 ? (
          <p className="font-sans text-sm text-muted-foreground italic">
            No lessons yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ul className="sm:col-span-1 divide-y divide-tbb-line border-t border-b border-tbb-line">
              {lessons.map((l) => (
                <li
                  key={l.id}
                  className={
                    "py-2 pl-2 flex items-center gap-2 cursor-pointer transition-colors " +
                    (l.id === activeLessonId ? "bg-tbb-cream-50" : "")
                  }
                  onClick={() => {
                    setActiveLessonId(l.id);
                    setLessonTitle(l.title);
                    setLessonBody(l.body ?? "");
                  }}
                >
                  <span className="font-sans text-sm font-bold text-foreground flex-1 truncate">
                    {l.title}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLesson(l.id, l.title);
                      }}
                      disabled={isPending}
                      aria-label={`Delete ${l.title}`}
                      className="p-1 rounded text-muted-foreground hover:text-tbb-danger"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="sm:col-span-2">
              {activeLesson ? (
                canEdit ? (
                  <div className="space-y-2">
                    <input
                      value={lessonTitle}
                      onChange={(e) => setLessonTitle(e.target.value)}
                      disabled={isPending}
                      className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm font-bold focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                    />
                    <textarea
                      rows={12}
                      value={lessonBody}
                      onChange={(e) => setLessonBody(e.target.value)}
                      disabled={isPending}
                      placeholder="Lesson body (markdown)…"
                      className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={saveLesson}
                        disabled={isPending}
                        className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
                      >
                        {isPending && (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        {isPending ? "Saving…" : "Save lesson"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-tbb-line rounded-md bg-white p-4">
                    <h3 className="font-bold text-foreground text-lg tracking-tight">
                      {activeLesson.title}
                    </h3>
                    {activeLesson.body && (
                      <div className="mt-3">
                        <MarkdownBody body={activeLesson.body} />
                      </div>
                    )}
                  </div>
                )
              ) : (
                <p className="font-sans text-sm text-muted-foreground italic">
                  Pick a lesson on the left.
                </p>
              )}
            </div>
          </div>
        )}
        {canEdit && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addLesson();
            }}
            className="flex items-center gap-2"
          >
            <input
              value={newLessonTitle}
              onChange={(e) => setNewLessonTitle(e.target.value)}
              placeholder="New lesson title…"
              disabled={isPending}
              className="flex-1 bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
            <button
              type="submit"
              disabled={isPending || !newLessonTitle.trim()}
              className="inline-flex items-center gap-1 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" aria-hidden /> Add lesson
            </button>
          </form>
        )}
      </section>

      {/* Cohorts section */}
      {course.deliveryMode === "cohort" && (
        <section className="space-y-3">
          <h2 className="font-bold text-foreground text-xl tracking-tight">
            Cohorts
          </h2>
          {cohorts.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground italic">
              No cohorts yet.
            </p>
          ) : (
            <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
              {cohorts.map((c) => (
                <li
                  key={c.id}
                  className="py-2 flex items-baseline gap-3 flex-wrap"
                >
                  <span className="font-bold text-foreground text-base tracking-tight">
                    {c.name}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {c.status}
                  </span>
                  {c.startsAt && (
                    <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                      {new Date(c.startsAt).toLocaleDateString()}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addCohort();
              }}
              className="flex items-center gap-2"
            >
              <input
                value={newCohortName}
                onChange={(e) => setNewCohortName(e.target.value)}
                placeholder="New cohort name (e.g. Spring 2026)…"
                disabled={isPending}
                className="flex-1 bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
              <button
                type="submit"
                disabled={isPending || !newCohortName.trim()}
                className="inline-flex items-center gap-1 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
              >
                <Plus className="w-3 h-3" aria-hidden /> Add cohort
              </button>
            </form>
          )}
        </section>
      )}

      {/* Enrollments section */}
      <section className="space-y-3">
        <h2 className="font-bold text-foreground text-xl tracking-tight">
          Enrollments
        </h2>
        {enrollments.length === 0 ? (
          <p className="font-sans text-sm text-muted-foreground italic">
            Nobody enrolled yet.
          </p>
        ) : (
          <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
            {enrollments.map((e) => (
              <li key={e.id} className="py-2 flex items-baseline gap-3 flex-wrap">
                <span className="font-sans text-sm font-bold text-foreground">
                  {e.userName}
                </span>
                {canEdit ? (
                  <select
                    value={e.status}
                    onChange={(ev) =>
                      flipStatus(e.id, ev.target.value as EnrollmentItem["status"])
                    }
                    disabled={isPending}
                    className="ml-auto font-mono text-[10px] uppercase tracking-tbb-caps bg-white border border-tbb-line rounded-full px-2 py-1 cursor-pointer"
                  >
                    <option value="enrolled">Enrolled</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="dropped">Dropped</option>
                  </select>
                ) : (
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {e.status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              enrollSomeone();
            }}
            className="flex items-center gap-2"
          >
            <select
              value={enrollMember}
              onChange={(e) => setEnrollMember(e.target.value)}
              disabled={isPending}
              className="flex-1 bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            >
              <option value="">Pick a member to enrol…</option>
              {members
                .filter((m) => !enrollments.some((e) => e.userProfileId === m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              disabled={isPending || !enrollMember}
              className="inline-flex items-center gap-1 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" aria-hidden /> Enroll
            </button>
          </form>
        )}
      </section>

      {canEdit && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={togglePublished}
              disabled={isPending}
              className={
                "font-sans text-xs uppercase tracking-tbb-caps font-bold px-3 py-1.5 rounded-md " +
                (course.isPublished
                  ? "border border-tbb-line text-foreground hover:bg-tbb-cream-50"
                  : "bg-tbb-blue-700 text-white hover:bg-tbb-blue") +
                " disabled:opacity-50"
              }
            >
              {course.isPublished ? "Unpublish" : "Publish course"}
            </button>
            <button
              type="button"
              onClick={onDeleteCourse}
              disabled={isPending}
              className="font-sans text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-tbb-danger underline-offset-4 hover:underline"
            >
              Delete course
            </button>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="font-sans text-sm text-tbb-danger">
          {error}
        </p>
      )}
    </div>
  );
}
