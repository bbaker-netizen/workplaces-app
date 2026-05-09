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
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {engagement.name ?? "Engagement"}
          </p>
          <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
            Courses
          </h1>
          <p className="font-sans text-sm text-muted-foreground">
            LMDS, ELS, custom programs. Self-paced or cohort delivery.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/portal/courses/new"
            className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057]"
          >
            <Plus className="w-4 h-4" aria-hidden /> New course
          </Link>
        )}
      </header>

      {items.length === 0 ? (
        <div className="border border-[#CCCCCC] rounded-md bg-white p-6">
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
              className="border border-[#CCCCCC] rounded-md bg-white p-4"
            >
              <Link
                href={`/portal/courses/${c.id}`}
                className="block group"
              >
                <h2 className="font-display font-bold text-foreground text-lg tracking-tight group-hover:underline underline-offset-4">
                  {c.name}
                </h2>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
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
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
