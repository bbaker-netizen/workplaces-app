import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { getCourseWithChildren } from "@/lib/db/queries/courses";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { CourseManager } from "@/components/courses/CourseManager";

export default async function CourseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");
  const course = await getCourseWithChildren(params.id);
  if (!course) notFound();

  const canEdit =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";
  const members = canEdit ? await listEngagementMembers(engagement.id) : [];

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-10">
      <header className="space-y-2">
        <Link
          href="/portal/courses"
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          ← All courses
        </Link>
        <h1 className="font-display font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {course.name}
        </h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          {course.deliveryMode === "cohort" ? "Cohort" : "Self-paced"}
          {" · "}
          {course.isPublished ? "Published" : "Draft"}
        </p>
      </header>

      <CourseManager
        course={{
          id: course.id,
          name: course.name,
          description: course.description,
          deliveryMode: course.deliveryMode,
          isPublished: course.isPublished,
        }}
        lessons={course.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          body: l.body,
          orderIndex: Number(l.orderIndex),
        }))}
        cohorts={course.cohorts.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
        }))}
        enrollments={course.enrollments.map((e) => ({
          id: e.id,
          userProfileId: e.userProfileId,
          userName: e.userName,
          status: e.status,
          completedAt: e.completedAt,
        }))}
        members={members.map((m) => ({ id: m.id, fullName: m.fullName }))}
        canEdit={canEdit}
      />
    </main>
  );
}
