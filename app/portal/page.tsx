import Link from "next/link";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { redirect } from "next/navigation";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";

export default async function PortalDashboard() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 sm:py-16">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Portal
        </p>
        <h1 className="font-display font-bold text-foreground text-4xl sm:text-5xl tracking-tight leading-none">
          Welcome, {profile.fullName}
        </h1>
        {engagement?.name && (
          <p className="font-sans text-muted-foreground">
            Engagement:{" "}
            <span className="font-mono text-foreground">{engagement.name}</span>
          </p>
        )}
      </header>

      <section className="mt-12 space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Modules
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <li>
            <Link
              href="/portal/action-items"
              className="block bg-white border border-[#CCCCCC] rounded-md px-5 py-4 hover:border-[#666666] transition-colors"
            >
              <p className="font-display font-bold text-foreground text-xl tracking-tight">
                Action items
              </p>
              <p className="mt-1 font-sans text-sm text-muted-foreground">
                Owned, dated commitments.
              </p>
            </Link>
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <p className="font-mono text-xs text-muted-foreground space-y-1">
          <span className="block">org: {profile.orgId}</span>
          <span className="block">role: {profile.role}</span>
        </p>
      </section>
    </main>
  );
}
