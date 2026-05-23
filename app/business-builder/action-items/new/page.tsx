import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachEngagements } from "@/lib/db/queries/engagements";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { BusinessBuilderNewActionItemForm } from "@/components/action-items/BusinessBuilderNewActionItemForm";
import { STATUSES_VISIBLE_TO_COACH } from "@/components/action-items/utils";

export default async function NewCoachActionItemPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const engagements = await listCoachEngagements();
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

  // Pre-fetch members for each engagement so the form's engagement
  // picker can switch members without an extra round-trip.
  const engagementsWithMembers = await Promise.all(
    engagements.map(async (e) => ({
      id: e.id,
      name: e.name,
      members: (await listEngagementMembers(e.id)).map((m) => ({
        id: m.id,
        fullName: m.fullName,
        role: m.role,
      })),
    })),
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
        initialEngagementId={engagementsWithMembers[0].id}
        currentUserProfileId={profile.userProfileId}
        statusOptions={STATUSES_VISIBLE_TO_COACH}
      />
    </main>
  );
}
