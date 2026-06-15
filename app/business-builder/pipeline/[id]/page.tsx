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
import {
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  Link2,
  Share2,
  AtSign,
  Search,
} from "lucide-react";
import { linkedInSearchUrl } from "@/lib/pipeline/social";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { formatPhone, normalizeWebsite } from "@/lib/format";
import {
  getProspect,
  listProspectActivities,
} from "@/lib/db/queries/prospects";
import { listEnvelopesForProspect } from "@/lib/db/queries/signatures";
import { listForProspect } from "@/lib/db/queries/client-communications";
import { listBusinessBuilders } from "@/lib/db/queries/user-profiles";
import {
  documentTemplates,
  emailTemplates,
  orgs as orgsTable,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { ProspectStatusSelect } from "@/components/pipeline/ProspectStatusSelect";
import { ProspectDealCard } from "@/components/pipeline/ProspectDealCard";
import { ProspectActivityTimeline } from "@/components/pipeline/ProspectActivityTimeline";
import { ProspectEnvelopeSection } from "@/components/pipeline/ProspectEnvelopeSection";
import { ProspectInlineEdit } from "@/components/pipeline/ProspectInlineEdit";
import { ProspectQboCustomerPicker } from "@/components/pipeline/ProspectQboCustomerPicker";
import { ActivateEngagementButton } from "@/components/pipeline/ActivateEngagementButton";
import { ResetEngagementButton } from "@/components/pipeline/ResetEngagementButton";
import { ClientCommunicationsPanel } from "@/components/communications/ClientCommunicationsPanel";
import { SendDiagnosticButton } from "@/components/pipeline/SendDiagnosticButton";
import { ScheduleMeetingButton } from "@/components/pipeline/ScheduleMeetingButton";
import { ProspectNextStep } from "@/components/pipeline/ProspectNextStep";
import { SoulFilePreviewButton } from "@/components/pipeline/SoulFilePreviewButton";
import { DeleteProspectButton } from "@/components/pipeline/DeleteProspectButton";
import { isSmsConfigured } from "@/lib/integrations/twilio";
import {
  canSendDiagnostic,
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

  const [
    activities,
    envelopes,
    hasStoredSig,
    communications,
    templates,
    docTemplates,
    me,
    org,
    businessBuilders,
  ] = await Promise.all([
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
    listForProspect(prospect.id),
    withSystemContext(async (tx) => {
      return tx
        .select({
          id: emailTemplates.id,
          name: emailTemplates.name,
          category: emailTemplates.category,
        })
        .from(emailTemplates)
        .where(eq(emailTemplates.orgId, profile.orgId));
    }),
    withSystemContext(async (tx) =>
      tx
        .select({
          id: documentTemplates.id,
          name: documentTemplates.name,
          category: documentTemplates.category,
          bodyMarkdown: documentTemplates.bodyMarkdown,
          defaultSubject: documentTemplates.defaultSubject,
        })
        .from(documentTemplates)
        .where(eq(documentTemplates.orgId, profile.orgId)),
    ),
    withSystemContext(async (tx) => {
      const [u] = await tx
        .select({
          fullName: userProfiles.fullName,
          email: userProfiles.email,
        })
        .from(userProfiles)
        .where(eq(userProfiles.id, profile.userProfileId))
        .limit(1);
      return u ?? null;
    }),
    // Org / company info — drives the {{org_*}} variables in the BBA
    // so the contract preamble auto-fills with Bruce's legal entity,
    // address, and province instead of being hardcoded.
    withSystemContext(async (tx) => {
      const [o] = await tx
        .select()
        .from(orgsTable)
        .where(eq(orgsTable.id, profile.orgId))
        .limit(1);
      return o ?? null;
    }),
    listBusinessBuilders(),
  ]);

  const stage = STAGE_STYLES[prospect.status as ProspectStatus] ?? STAGE_STYLES.new_lead;

  // Most recent "Diagnostic sent" date, surfaced under the action so the
  // profile documents when it went out (activities are sorted newest-first).
  const lastDiagnosticSentAt =
    activities.find((a) => a.type === "diagnostic_sent")?.occurredAt ?? null;
  const showDiagnostic = canSendDiagnostic(prospect.status as ProspectStatus);

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/business-builder/pipeline"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Pipeline
        </Link>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-tbb-h2 font-bold text-tbb-navy tracking-tbb-tight">
            {prospect.companyName}
          </h1>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Stage
            </span>
            <ProspectStatusSelect
              prospectId={prospect.id}
              current={prospect.status as ProspectStatus}
            />
          </span>
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
                companyName={prospect.companyName}
                initial={{
                  contactName: prospect.contactName,
                  contactEmail: prospect.contactEmail,
                  phone: prospect.phone,
                  companyWebsite: prospect.companyWebsite,
                  linkedinUrl: prospect.linkedinUrl,
                  facebookUrl: prospect.facebookUrl,
                  instagramUrl: prospect.instagramUrl,
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
                  label={formatPhone(prospect.phone)}
                />
              )}
              {prospect.companyWebsite && (
                <ContactRow
                  icon={<Globe className="w-3.5 h-3.5" />}
                  href={normalizeWebsite(prospect.companyWebsite) ?? "#"}
                  label={prospect.companyWebsite.replace(/^https?:\/\//, "")}
                  external
                />
              )}
              {prospect.linkedinUrl ? (
                <ContactRow
                  icon={<Link2 className="w-3.5 h-3.5" />}
                  href={normalizeWebsite(prospect.linkedinUrl) ?? "#"}
                  label={prospect.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "")}
                  external
                />
              ) : (
                <a
                  href={linkedInSearchUrl(
                    prospect.contactName ?? "",
                    prospect.companyName,
                  )}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-tbb-blue hover:underline"
                >
                  <Search className="w-3.5 h-3.5" aria-hidden /> Find on LinkedIn
                </a>
              )}
              {prospect.facebookUrl && (
                <ContactRow
                  icon={<Share2 className="w-3.5 h-3.5" />}
                  href={normalizeWebsite(prospect.facebookUrl) ?? "#"}
                  label={prospect.facebookUrl.replace(/^https?:\/\/(www\.)?/, "")}
                  external
                />
              )}
              {prospect.instagramUrl && (
                <ContactRow
                  icon={<AtSign className="w-3.5 h-3.5" />}
                  href={normalizeWebsite(prospect.instagramUrl) ?? "#"}
                  label={prospect.instagramUrl.replace(/^https?:\/\/(www\.)?/, "")}
                  external
                />
              )}
            </div>
          </section>

          {/* What's next — surfaces the obvious next move based on the
              current stage so Bruce always sees a clear suggested action. */}
          <ProspectNextStep status={prospect.status as ProspectStatus} />

          {/* Quick actions — Schedule a meeting + send the diagnostic. */}
          <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-4 shadow-tbb-sm">
            <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Quick actions
            </h2>
            <ScheduleMeetingButton
              prospectId={prospect.id}
              companyName={prospect.companyName}
              recipientName={prospect.contactName}
            />
            {showDiagnostic && (
              <div className="border-t border-tbb-line-soft pt-4 space-y-2">
                <p className="text-xs text-tbb-ink-3">
                  Email them the public business diagnostic form. Their
                  submission will land back on this record.
                </p>
                <SendDiagnosticButton
                  prospectId={prospect.id}
                  recipientName={prospect.contactName}
                  recipientEmail={prospect.contactEmail}
                />
                {lastDiagnosticSentAt && (
                  <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-4">
                    Diagnostic sent ·{" "}
                    {lastDiagnosticSentAt.toLocaleDateString("en-CA", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                )}
              </div>
            )}
            <div className="border-t border-tbb-line-soft pt-4 space-y-2">
              <p className="text-xs text-tbb-ink-3">
                If we&apos;ve already had Fireflies-recorded sessions with
                this prospect, draft the Business Builder insights on them
                — no engagement created, no portal invite sent. Pure
                preview so you can see what we know before deciding to
                formalize them.
              </p>
              <SoulFilePreviewButton prospectId={prospect.id} />
            </div>
            {/* Convert prospect → engagement. Appears once the contract
                is signed (or whenever Bruce wants to formalize). Carries
                program type, pricing tier, monthly fee, and start date
                across so the engagement form is pre-filled. */}
            {!prospect.convertedEngagementId &&
              prospect.status !== "onboarded" &&
              prospect.status !== "lost" && (
              <div className="border-t border-tbb-line-soft pt-4 space-y-2">
                <p className="text-xs text-tbb-ink-3">
                  Ready to formalize this prospect into a paying
                  engagement? We&apos;ll create their engagement + portal
                  so you can prepare it now. No email is sent — you invite
                  the client to their portal separately when you&apos;re
                  ready.
                </p>
                <ActivateEngagementButton prospectId={prospect.id} />
              </div>
            )}
            {prospect.convertedEngagementId && (
              <div className="border-t border-tbb-line-soft pt-4 space-y-2">
                <p className="text-xs text-tbb-success font-bold">
                  ✓ Active engagement
                </p>
                <a
                  href={`/business-builder/engagements/${prospect.convertedEngagementId}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
                >
                  Open engagement workspace →
                </a>
                <ResetEngagementButton prospectId={prospect.id} />
              </div>
            )}
          </section>

          {/* Deal card */}
          <ProspectDealCard
            prospectId={prospect.id}
            totalClientValueCents={prospect.qboLifetimePaymentsCents}
            leadSource={prospect.leadSource}
            referrerName={prospect.referrerName}
            ownerUserProfileId={prospect.ownerUserProfileId}
            ownerName={prospect.ownerName}
            nextActionDate={prospect.nextActionDate}
            nextActionNote={prospect.nextActionNote}
            lastContactAt={prospect.lastContactAt}
            programType={prospect.programType}
            monthlyFeeCents={prospect.monthlyFeeCents}
            businessBuilders={businessBuilders}
          />

          {/* QuickBooks customer link — drives the pipeline Value */}
          <ProspectQboCustomerPicker
            prospectId={prospect.id}
            customerId={prospect.qboCustomerId}
            customerName={prospect.qboCustomerName}
            lifetimePaymentsCents={prospect.qboLifetimePaymentsCents}
            syncedAt={prospect.qboValueSyncedAt?.toISOString() ?? null}
            linkedAt={prospect.qboLinkedAt?.toISOString() ?? null}
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
            documentTemplates={docTemplates}
            variableContext={{
              prospect: {
                contactName: prospect.contactName,
                companyName: prospect.companyName,
                contactEmail: prospect.contactEmail,
                phone: prospect.phone,
                programType:
                  prospect.programType === "accelerator" ||
                  prospect.programType === "implementer"
                    ? prospect.programType
                    : null,
                monthlyFeeCents: prospect.monthlyFeeCents,
                expectedStartDate: prospect.expectedStartDate,
              },
              org: org
                ? {
                    name: org.name,
                    legalName: org.legalName,
                    address: org.businessAddress,
                    city: org.businessCity,
                    province: org.businessProvince,
                    country: org.businessCountry,
                    postalCode: org.businessPostalCode,
                    phone: org.businessPhone,
                    website: org.businessWebsite,
                    taxId: org.taxId,
                  }
                : null,
              sender: {
                fullName: me?.fullName ?? "",
                email: me?.email ?? "",
              },
            }}
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

      {/* Full-width communications timeline — every email / SMS / WhatsApp /
          call note attached to this prospect. */}
      <ClientCommunicationsPanel
        prospectId={prospect.id}
        contactName={prospect.contactName}
        contactEmail={prospect.contactEmail}
        contactPhone={prospect.phone}
        rows={communications}
        smsEnabled={isSmsConfigured()}
        emailTemplates={templates}
      />

      {/* Archive this prospect (soft-delete). Recoverable from the
          Archived view; activity log + comms are preserved. */}
      <section className="border border-tbb-danger/30 bg-tbb-cream-50 rounded-lg p-5 space-y-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-danger">
            {prospect.archivedAt ? "Archived" : "Archive"}
          </p>
          <p className="text-sm text-tbb-ink-2 mt-1">
            {prospect.archivedAt
              ? "This prospect is archived and hidden from the pipeline. Restore it to bring it back."
              : "Archive removes this prospect from the pipeline but keeps the record, activity log, and communications — restore it anytime. For deals that didn't close, set Stage = Lost instead so they stay in the funnel history."}
          </p>
        </div>
        <DeleteProspectButton
          prospectId={prospect.id}
          prospectLabel={prospect.companyName}
          archived={Boolean(prospect.archivedAt)}
        />
      </section>
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
