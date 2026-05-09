import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { ProjectForm } from "@/components/projects/ProjectForm";

export default async function NewProjectPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (
    profile.role !== "master_admin" &&
    profile.role !== "coach" &&
    profile.role !== "client_lead" &&
    profile.role !== "client_manager"
  )
    redirect("/portal/projects");

  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");
  const members = await listEngagementMembers(engagement.id);

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-display font-bold text-foreground text-3xl tracking-tight leading-none">
          New project
        </h1>
        <Link
          href="/portal/projects"
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          ← All projects
        </Link>
      </header>

      <ProjectForm
        engagementId={engagement.id}
        initial={{
          name: "",
          description: "",
          status: "planning",
          leadUserProfileId: profile.userProfileId,
          startDate: "",
          targetDate: "",
          revenueImpact: false,
          marginImpact: false,
        }}
        members={members.map((m) => ({ id: m.id, fullName: m.fullName }))}
        redirectTo="/portal/projects"
      />
    </main>
  );
}
