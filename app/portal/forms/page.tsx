import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementForms } from "@/lib/db/queries/forms";

const TYPE_LABEL: Record<string, string> = {
  diagnostic: "Diagnostic",
  intake: "Intake",
  pulse: "Pulse",
  nps: "NPS",
  custom: "Custom",
};

export default async function PortalFormsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const items = await listEngagementForms(engagement.id);
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
            Forms
          </h1>
          <p className="font-sans text-sm text-muted-foreground">
            Diagnostic, intake, pulse, NPS, custom. Build, share, see responses in one place.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/portal/forms/new"
            className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
          >
            <Plus className="w-4 h-4" aria-hidden /> New form
          </Link>
        )}
      </header>

      {items.length === 0 ? (
        <div className="border border-tbb-line rounded-md bg-white p-6">
          <p className="font-sans text-sm text-muted-foreground italic">
            {canCreate
              ? "No forms yet. Build the first one above."
              : "Your Business Builder hasn't published any forms yet."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
          {items.map((f) => (
            <li key={f.id}>
              <Link
                href={`/portal/forms/${f.id}`}
                className="block py-3 pl-3 hover:bg-tbb-cream-50 transition-colors group"
              >
                <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                  <span className="font-bold text-foreground text-base tracking-tight group-hover:underline underline-offset-4">
                    {f.name}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                    {TYPE_LABEL[f.type] ?? f.type}
                  </span>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {f.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                {f.description && (
                  <p className="mt-1 font-sans text-sm text-muted-foreground line-clamp-2">
                    {f.description}
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
