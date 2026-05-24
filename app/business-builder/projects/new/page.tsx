/**
 * /business-builder/projects/new — Business Builder-side project
 * creation. Accepts ?engagement=<uuid> in the URL to pre-pick the
 * engagement (used by the Workspace view's "Add project" link); if
 * absent, shows an engagement picker first.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachEngagements } from "@/lib/db/queries/engagements";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { ProjectForm } from "@/components/projects/ProjectForm";

export default async function NewBusinessBuilderProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ engagement?: string }>;
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const sp = await searchParams;
  const engagements = await listCoachEngagements();

  if (engagements.length === 0) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-12 space-y-6">
        <header className="space-y-2">
          <Link
            href="/business-builder/projects"
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
          >
            <ArrowLeft className="w-3 h-3" aria-hidden /> Projects
          </Link>
          <h1 className="font-bold text-tbb-navy text-3xl tracking-tight">
            New project
          </h1>
        </header>
        <div className="border border-dashed border-tbb-line rounded-md bg-white p-6 text-center space-y-2">
          <p className="font-bold text-tbb-navy">No engagements yet</p>
          <p className="text-sm text-tbb-ink-3">
            Projects live inside an engagement. Create one first.
          </p>
          <Link
            href="/business-builder/engagements/new"
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
          >
            New engagement
          </Link>
        </div>
      </main>
    );
  }

  const engagementId =
    sp.engagement && engagements.some((e) => e.id === sp.engagement)
      ? sp.engagement
      : engagements[0].id;
  const engagement = engagements.find((e) => e.id === engagementId)!;
  const members = await listEngagementMembers(engagementId);

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/business-builder/projects"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Projects
        </Link>
        <p className="tbb-eyebrow">{engagement.name ?? "Engagement"}</p>
        <h1 className="font-bold text-tbb-navy text-3xl tracking-tight leading-none">
          New project
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-md">
          A body of work that ships something — &quot;Hire VP Sales,&quot;
          &quot;Launch new service line.&quot; Action items nest under it.
        </p>
      </header>

      {engagements.length > 1 && (
        <EngagementPicker
          engagements={engagements.map((e) => ({
            id: e.id,
            name: e.name ?? "(unnamed)",
          }))}
          currentId={engagementId}
        />
      )}

      <ProjectForm
        engagementId={engagementId}
        initial={{
          name: "",
          description: "",
          status: "planning",
          leadUserProfileId: profile.userProfileId,
          startDate: "",
          targetDate: "",
          revenueImpact: false,
          marginImpact: false,
          goalId: null,
        }}
        members={members.map((m) => ({ id: m.id, fullName: m.fullName }))}
        redirectTo={`/business-builder/engagements/${engagementId}`}
      />
    </main>
  );
}

// Client-side engagement picker — switches the URL's ?engagement
// param so the form remounts with the right engagement context.
function EngagementPicker({
  engagements,
  currentId,
}: {
  engagements: Array<{ id: string; name: string }>;
  currentId: string;
}) {
  return (
    <form className="border border-tbb-line rounded-md bg-white p-3 flex items-center gap-3">
      <label className="flex-1 flex items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 shrink-0">
          Engagement
        </span>
        <select
          name="engagement"
          defaultValue={currentId}
          className="flex-1 bg-white border border-tbb-line rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        >
          {engagements.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue"
      >
        Switch
      </button>
    </form>
  );
}
