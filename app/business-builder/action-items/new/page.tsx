import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachEngagements } from "@/lib/db/queries/engagements";
import { listEngagementProjects } from "@/lib/db/queries/projects";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { BusinessBuilderNewActionItemForm } from "@/components/action-items/BusinessBuilderNewActionItemForm";
import { STATUSES_VISIBLE_TO_COACH } from "@/components/action-items/utils";

export default async function NewCoachActionItemPage({
  searchParams,
}: {
  searchParams?: { engagement?: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  // includeInternal: tasking a teammate is a first-class use of this
  // form. Without it the internal workspace is invisible here and the
  // only way to task Jen would be from inside a meeting agenda.
  const engagements = await listCoachEngagements({ includeInternal: true });
  if (engagements.length === 0) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-bold text-foreground text-3xl tracking-tight">
          No engagements yet
        </h1>
        <p className="mt-4 font-sans text-muted-foreground">
          Create an engagement first at{" "}
          <a
            href="/business-builder/engagements/new"
            className="underline underline-offset-4 text-tbb-navy hover:text-foreground"
          >
            /business-builder/engagements/new
          </a>
          .
        </p>
      </main>
    );
  }

  // Deep-link support: /business-builder/action-items/new?engagement=<id>
  // lets the Team page hand you a form already pointed at the internal
  // workspace. Ignored unless the id is one this Business Builder can
  // actually reach, so the param can't widen access.
  const requested = searchParams?.engagement;
  const preselectedId = engagements.some((e) => e.id === requested)
    ? requested
    : null;

  // Pre-fetch members + projects for each engagement so the form's
  // engagement picker can switch context without an extra round-trip.
  const engagementsWithMembers = await Promise.all(
    engagements.map(async (e) => {
      const [members, projects] = await Promise.all([
        listEngagementMembers(e.id),
        listEngagementProjects(e.id),
      ]);
      return {
        id: e.id,
        name: e.name,
        members: members.map((m) => ({
          id: m.id,
          fullName: m.fullName,
          role: m.role,
        })),
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
      };
    }),
  );

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          New action item
        </h1>
      </header>

      <BusinessBuilderNewActionItemForm
        engagements={engagementsWithMembers}
        initialEngagementId={preselectedId ?? engagementsWithMembers[0].id}
        currentUserProfileId={profile.userProfileId}
        statusOptions={STATUSES_VISIBLE_TO_COACH}
      />
    </main>
  );
}
