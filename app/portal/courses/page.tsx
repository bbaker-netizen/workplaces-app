import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementCourses } from "@/lib/db/queries/courses";

export default async function CoursesPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const items = await listEngagementCourses(engagement.id);
  const canCreate =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-8 flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            {engagement.name ?? "Engagement"}
          </p>
          <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
            Courses
          </h1>
          <p className="font-sans text-sm text-muted-foreground">
            LMDS, ELS, custom programs. Self-paced or cohort delivery.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/portal/courses/new"
            className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
          >
            <Plus className="w-4 h-4" aria-hidden /> New course
          </Link>
        )}
      </header>

      {items.length === 0 ? (
        <div className="border border-tbb-line rounded-md bg-white p-6">
          <p className="font-sans text-sm text-muted-foreground italic">
            {canCreate
              ? "No courses yet. Build the first one above."
              : "Your coach hasn't published any courses yet."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((c) => (
            <li
              key={c.id}
              className="border border-tbb-line rounded-md bg-white p-4 space-y-3"
            >
              <Link
                href={`/portal/courses/${c.id}`}
                className="block group"
              >
                <h2 className="font-bold text-foreground text-lg tracking-tight group-hover:underline underline-offset-4">
                  {c.name}
                </h2>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                  {c.deliveryMode === "cohort" ? "Cohort" : "Self-paced"}
                  {" · "}
                  {c.isPublished ? "Published" : "Draft"}
                </p>
                {c.description && (
                  <p className="mt-2 font-sans text-sm text-muted-foreground line-clamp-3">
                    {c.description}
                  </p>
                )}
              </Link>
              {c.isPublished && (
                <Link
                  href={`/portal/courses/${c.id}/learn`}
                  className="inline-flex items-center gap-1 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-blue text-tbb-navy bg-white hover:bg-tbb-cream-50"
                >
                  Start learning →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
