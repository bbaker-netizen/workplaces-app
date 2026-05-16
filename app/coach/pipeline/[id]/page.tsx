/**
 * Prospect detail — Phase 5 CRM.
 *
 * Two-column layout:
 *   - Left: full contact card, deal info, notes, signing section
 *   - Right: activity log timeline
 *
 * Edits land via inline forms; activity logging via a quick form
 * at the top of the timeline.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Mail, Phone, Globe } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  getProspect,
  listProspectActivities,
} from "@/lib/db/queries/prospects";
import { listEnvelopesForProspect } from "@/lib/db/queries/signatures";
import { userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { ProspectStatusSelect } from "@/components/pipeline/ProspectStatusSelect";
import { ProspectDealCard } from "@/components/pipeline/ProspectDealCard";
import { ProspectActivityTimeline } from "@/components/pipeline/ProspectActivityTimeline";
import { ProspectEnvelopeSection } from "@/components/pipeline/ProspectEnvelopeSection";
import { ProspectInlineEdit } from "@/components/pipeline/ProspectInlineEdit";
import {
  STAGE_STYLES,
  type ProspectStatus,
} from "@/lib/pipeline/stages";

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

  const [activities, envelopes, hasStoredSig] = await Promise.all([
    listProspectActivities(prospect.id),
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

  const stage = STAGE_STYLES[prospect.status as ProspectStatus] ?? STAGE_STYLES.new_lead;

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/coach/pipeline"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Pipeline
        </Link>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-tbb-h2 font-bold text-tbb-navy tracking-tbb-tight">
            {prospect.companyName}
          </h1>
          <ProspectStatusSelect
            prospectId={prospect.id}
            current={prospect.status as ProspectStatus}
          />
        </div>
        <p className="text-sm text-tbb-ink-3">
          {stage.caption} · Created{" "}
          {prospect.createdAt.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — contact + deal + notes + signing */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact card */}
          <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Contact
              </h2>
              <ProspectInlineEdit
                prospectId={prospect.id}
                field="contact"
                initial={{
                  contactName: prospect.contactName,
                  contactEmail: prospect.contactEmail,
                  phone: prospect.phone,
                  companyWebsite: prospect.companyWebsite,
                }}
              />
            </div>
            <div className="space-y-1">
              <p className="text-tbb-navy font-bold">
                {prospect.contactName || "(no contact name)"}
              </p>
              <ContactRow
                icon={<Mail className="w-3.5 h-3.5" />}
                href={`mailto:${prospect.contactEmail}`}
                label={prospect.contactEmail}
              />
              {prospect.phone && (
                <ContactRow
                  icon={<Phone className="w-3.5 h-3.5" />}
                  href={`tel:${prospect.phone}`}
                  label={prospect.phone}
                />
              )}
              {prospect.companyWebsite && (
                <ContactRow
                  icon={<Globe className="w-3.5 h-3.5" />}
                  href={prospect.companyWebsite}
                  label={prospect.companyWebsite}
                  external
                />
              )}
            </div>
          </section>

          {/* Deal card */}
          <ProspectDealCard
            prospectId={prospect.id}
            expectedValueCents={prospect.expectedValueCents}
            leadSource={prospect.leadSource}
            ownerName={prospect.ownerName}
            nextActionDate={prospect.nextActionDate}
            nextActionNote={prospect.nextActionNote}
            lastContactAt={prospect.lastContactAt}
          />

          {/* Notes */}
          <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Notes
              </h2>
              <ProspectInlineEdit
                prospectId={prospect.id}
                field="notes"
                initial={{ notes: prospect.notes }}
              />
            </div>
            {prospect.notes ? (
              <MarkdownBody body={prospect.notes} />
            ) : (
              <p className="text-sm text-tbb-ink-4 italic">No notes yet.</p>
            )}
          </section>

          {/* Signing */}
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
        </div>

        {/* Right column — activity timeline */}
        <aside className="lg:col-span-1">
          <ProspectActivityTimeline
            prospectId={prospect.id}
            activities={activities}
          />
        </aside>
      </div>
    </main>
  );
}

function ContactRow({
  icon,
  href,
  label,
  external,
}: {
  icon: React.ReactNode;
  href: string;
  label: string;
  external?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-tbb-ink-3 self-center">{icon}</span>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="text-tbb-blue hover:underline underline-offset-4 break-all"
      >
        {label}
      </a>
    </div>
  );
}
