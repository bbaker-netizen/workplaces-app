import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { getHire } from "@/lib/db/queries/hires";
import { HireForm } from "@/components/hires/HireForm";
import { HireGenerateButtons } from "@/components/hires/HireGenerateButtons";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

const STATUS_LABEL: Record<string, string> = {
  assessing: "Assessing",
  interview_scheduled: "Interview scheduled",
  decision_pending: "Decision pending",
  offer_sent: "Offer sent",
  hired: "Hired",
  declined: "Declined",
};

export default async function HireDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");
  const hire = await getHire(params.id);
  if (!hire) notFound();

  const canEdit =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/portal/hiring"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← Hiring pipeline
        </Link>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {hire.candidateName}
        </h1>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          <span>{hire.roleName}</span>
          <span>· {STATUS_LABEL[hire.status] ?? hire.status}</span>
          {hire.candidateEmail && <span>· {hire.candidateEmail}</span>}
        </div>
      </header>

      {canEdit ? (
        <HireForm
          engagementId={engagement.id}
          initial={{
            id: hire.id,
            candidateName: hire.candidateName,
            candidateEmail: hire.candidateEmail ?? "",
            roleName: hire.roleName,
            status: hire.status,
            notes: hire.notes ?? "",
          }}
          redirectTo="/portal/hiring"
          showDelete
        />
      ) : (
        hire.notes && (
          <section className="border border-tbb-line rounded-md bg-white p-4">
            <MarkdownBody body={hire.notes} />
          </section>
        )
      )}

      {canEdit && (
        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            AI assist
          </h2>
          <p className="font-sans text-sm text-muted-foreground">
            Each button reads the candidate&apos;s attached gap report (and resume / interview transcript when relevant), runs it through Claude using the Workplaces methodology prompts, and appends the result to the candidate&apos;s notes.
          </p>
          <HireGenerateButtons hireId={hire.id} />
        </section>
      )}
    </main>
  );
}
