import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { FormBuilder } from "@/components/forms/FormBuilder";

export default async function NewFormPage() {
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
    redirect("/portal/forms");

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <h1 className="font-display font-bold text-foreground text-3xl tracking-tight leading-none">
          New form
        </h1>
        <Link
          href="/portal/forms"
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          ← All forms
        </Link>
      </header>

      <FormBuilder
        engagementId={engagement.id}
        initial={{
          name: "",
          description: "",
          type: "intake",
          schema: [],
          isActive: true,
        }}
        redirectTo="/portal/forms"
      />
    </main>
  );
}
