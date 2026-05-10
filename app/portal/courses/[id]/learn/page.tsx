/**
 * Learner view — Phase 4. Lessons in order, mark-as-done, progress
 * bar. Distinct from the editor view at `/portal/courses/[id]` so the
 * learning experience isn't cluttered with admin controls.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCourseLearnerView } from "@/lib/db/queries/courses";
import { CourseLearner } from "@/components/courses/CourseLearner";

export default async function CourseLearnPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const view = await getCourseLearnerView(params.id);
  if (!view) notFound();

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href={`/portal/courses/${params.id}`}
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          ← Course details
        </Link>
        <h1 className="font-display font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {view.course.name}
        </h1>
        {view.course.description && (
          <p className="font-sans text-sm text-muted-foreground">
            {view.course.description}
          </p>
        )}
      </header>

      <CourseLearner
        lessons={view.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          body: l.body,
          orderIndex: Number(l.orderIndex),
          completedAt: l.completedAt,
        }))}
      />
    </main>
  );
}
