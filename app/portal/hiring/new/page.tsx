import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { HireForm } from "@/components/hires/HireForm";

export default async function NewHirePage() {
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
    redirect("/portal/hiring");

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-display font-bold text-foreground text-3xl tracking-tight leading-none">
          New candidate
        </h1>
        <Link
          href="/portal/hiring"
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          ← Hiring pipeline
        </Link>
      </header>
      <HireForm
        engagementId={engagement.id}
        initial={{
          candidateName: "",
          candidateEmail: "",
          roleName: "",
          status: "assessing",
          notes: "",
        }}
        redirectTo="/portal/hiring"
      />
    </main>
  );
}
