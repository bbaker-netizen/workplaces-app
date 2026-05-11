import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getProspect } from "@/lib/db/queries/prospects";
import { listEnvelopesForProspect } from "@/lib/db/queries/signatures";
import { userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { ProspectStatusSelect } from "@/components/pipeline/ProspectStatusSelect";
import { ProspectEnvelopeSection } from "@/components/pipeline/ProspectEnvelopeSection";

const STATUS_LABEL: Record<string, string> = {
  diagnostic_pending: "Diagnostic pending",
  diagnostic_complete: "Diagnostic complete",
  proposal_sent: "Proposal sent",
  contract_sent: "Contract sent",
  contract_signed: "Contract signed",
  onboarded: "Onboarded",
  lost: "Lost",
};

export default async function ProspectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const prospect = await getProspect(params.id);
  if (!prospect) notFound();

  const [envelopes, hasStoredSig] = await Promise.all([
    listEnvelopesForProspect(prospect.id),
    withSystemContext(async (tx) => {
      const [row] = await tx
        .select({ signatureImageData: userProfiles.signatureImageData })
        .from(userProfiles)
        .where(eq(userProfiles.id, profile.userProfileId))
        .limit(1);
      return Boolean(row?.signatureImageData);
    }),
  ]);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/coach/pipeline"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← Pipeline
        </Link>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {prospect.companyName}
        </h1>
        <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
          {prospect.contactName && (
            <span className="font-sans text-sm text-foreground">
              {prospect.contactName}
            </span>
          )}
          <a
            href={`mailto:${prospect.contactEmail}`}
            className="font-mono text-xs text-tbb-navy underline underline-offset-4"
          >
            {prospect.contactEmail}
          </a>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Status
          </span>
          <ProspectStatusSelect
            prospectId={prospect.id}
            current={prospect.status}
          />
        </div>
      </header>

      {prospect.notes && (
        <section className="border border-tbb-line rounded-md bg-white p-5 space-y-2">
          <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Diagnostic notes
          </h2>
          <MarkdownBody body={prospect.notes} />
        </section>
      )}

      <ProspectEnvelopeSection
        prospectId={prospect.id}
        defaultSignerName={prospect.contactName ?? ""}
        defaultSignerEmail={prospect.contactEmail}
        envelopes={envelopes.map((e) => ({
          id: e.id,
          subject: e.subject,
          status: e.status,
          createdAt: e.createdAt,
          completedAt: e.completedAt,
        }))}
        hasStoredSignature={hasStoredSig}
      />

      <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
        Created{" "}
        {prospect.createdAt.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}{" "}
        · Updated{" "}
        {prospect.updatedAt.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}{" "}
        · Stage: {STATUS_LABEL[prospect.status] ?? prospect.status}
      </p>
    </main>
  );
}
