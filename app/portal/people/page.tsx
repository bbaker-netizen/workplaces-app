import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementPersonProfiles } from "@/lib/db/queries/person-profiles";

export default async function PortalPeoplePage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");
  if (
    profile.role !== "master_admin" &&
    profile.role !== "coach" &&
    profile.role !== "client_lead" &&
    profile.role !== "client_manager"
  )
    redirect("/portal");

  const profiles = await listEngagementPersonProfiles(engagement.id);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-8 flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {engagement.name ?? "Engagement"}
          </p>
          <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
            Person profiles
          </h1>
          <p className="font-sans text-sm text-muted-foreground">
            TTI TriMetrix HD assessments per individual on the engagement.
          </p>
        </div>
        <Link
          href="/portal/people/new"
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057]"
        >
          <Plus className="w-4 h-4" aria-hidden /> New profile
        </Link>
      </header>

      {profiles.length === 0 ? (
        <div className="border border-[#CCCCCC] rounded-md bg-white p-6">
          <p className="font-sans text-sm text-muted-foreground italic">
            No person profiles yet. Add one above to ingest a TTI gap report.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#CCCCCC] border-t border-b border-[#CCCCCC]">
          {profiles.map((p) => (
            <li key={p.id}>
              <Link
                href={`/portal/people/${p.id}`}
                className="block py-3 pl-3 hover:bg-[#F5F1E8] transition-colors group"
              >
                <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                  <span className="font-display font-bold text-foreground text-base tracking-tight group-hover:underline underline-offset-4">
                    {p.fullName}
                  </span>
                  {p.role && (
                    <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                      {p.role}
                    </span>
                  )}
                  {p.assessmentDate && (
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {new Date(p.assessmentDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {p.summary && (
                  <p className="mt-1 font-sans text-sm text-muted-foreground line-clamp-2">
                    {p.summary}
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
