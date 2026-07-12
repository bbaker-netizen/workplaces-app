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
  Search,
  Clock,
  Mountain,
  Zap,
  StickyNote,
  FileText,
  MessageCircle,
  MessageSquare,
  CalendarClock,
  Video,
  Activity,
  Archive,
} from "lucide-react";
import { CollapsibleSection } from "@/components/pipeline/CollapsibleSection";
import { linkedInSearchUrl } from "@/lib/pipeline/social";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { formatPhone, normalizeWebsite } from "@/lib/format";
import { listProspectComments } from "@/lib/db/queries/prospect-comments";
import { listProspectDocuments } from "@/lib/db/queries/prospect-documents";
import {
  daysSinceContact,
  isProspectStale,
} from "@/lib/pipeline/staleness";
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
import { ProspectLeadEssentials } from "@/components/pipeline/ProspectLeadEssentials";
import { ProspectDealCard } from "@/components/pipeline/ProspectDealCard";
import { ProspectActivityTimeline } from "@/components/pipeline/ProspectActivityTimeline";
import { ProspectComments } from "@/components/pipeline/ProspectComments";
import { ProspectDocuments } from "@/components/pipeline/ProspectDocuments";
import { ProspectEnvelopeSection } from "@/components/pipeline/ProspectEnvelopeSection";
import { ProspectInlineEdit } from "@/components/pipeline/ProspectInlineEdit";
import { ProspectQboCustomerPicker } from "@/components/pipeline/ProspectQboCustomerPicker";
import { ActivateEngagementButton } from "@/components/pipeline/ActivateEngagementButton";
import { ResetEngagementButton } from "@/components/pipeline/ResetEngagementButton";
import { ClientCommunicationsPanel } from "@/components/communications/ClientCommunicationsPanel";
import { ScheduleMeetingButton } from "@/components/pipeline/ScheduleMeetingButton";
import { StartRecordedSessionButton } from "@/components/pipeline/StartRecordedSessionButton";
import { ProspectNextStep } from "@/components/pipeline/ProspectNextStep";
import { ScheduleFollowupPanel } from "@/components/pipeline/ScheduleFollowupPanel";
import { BookingFollowThroughPanel } from "@/components/pipeline/BookingFollowThroughPanel";
import { getBookingFollowThroughForProspect } from "@/lib/db/queries/booking-follow-through";
import { SoulFilePreviewButton } from "@/components/pipeline/SoulFilePreviewButton";
import { DeleteProspectButton } from "@/components/pipeline/DeleteProspectButton";
import { isSmsConfigured } from "@/lib/integrations/twilio";
import {
  prospectPhase,
  STAGE_STYLES,
  type ProspectStatus,
} from "@/lib/pipeline/stages";

// Always render fresh from the database. Without this the prospect page
// can be served from a cached render, so a just-saved phone / lead source
// appears to "disappear" (you're seeing a stale snapshot, not real data
// loss). force-dynamic guarantees every load — and every router.refresh()
// after a save — reflects the current row.
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    comments,
    prospectDocs,
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
    listProspectComments(prospect.id),
    listProspectDocuments(prospect.id),
  ]);

  // Booking follow-through row, if this prospect came in via a booked
  // session. Drives the three-email NDA/paperwork panel.
  const bookingFt = await getBookingFollowThroughForProspect(prospect.id);

  const stage = STAGE_STYLES[prospect.status as ProspectStatus] ?? STAGE_STYLES.new_lead;

  // Stage-aware sections: leads stay lean; deal/QBO/convert/signing only
  // surface once the prospect is far enough along to need them.
  const phase = prospectPhase(prospect.status as ProspectStatus);
  const isConverted = Boolean(prospect.convertedEngagementId);
  const showDeal = phase === "qualifying" || phase === "closing" || phase === "won";
  // Fireflies "Preview insights" is useful right through the initial
  // prospect process, so keep it available at every live stage (not lost).
  const showSoulPreview = phase !== "lost";
  const showSigning = showDeal;
  const showQbo = phase === "closing" || phase === "won" || isConverted;
  const showConvert = phase === "closing";

  // Next-action date/time for the follow-up panel. Guard the date parsing:
  // an unparseable stored value would otherwise make `.toISOString()` throw
  // a RangeError and crash the whole page render. A stored time of exactly
  // noon is our "no specific time" sentinel, shown as blank.
  const nextActionAt = prospect.nextActionDate
    ? new Date(prospect.nextActionDate)
    : null;
  const nextActionValid =
    nextActionAt !== null && !Number.isNaN(nextActionAt.getTime());
  const nextActionDateYmd = nextActionValid
    ? nextActionAt!.toISOString().slice(0, 10)
    : null;
  const nextActionTime = nextActionValid
    ? nextActionAt!.toISOString().slice(11, 16)
    : null;

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
              alreadyConverted={Boolean(prospect.convertedEngagementId)}
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

      {isProspectStale({
        status: prospect.status,
        lastContactAt: prospect.lastContactAt,
        createdAt: prospect.createdAt,
        archivedAt: prospect.archivedAt,
      }) && (
        <div className="flex items-start gap-3 rounded-lg border border-tbb-orange/40 bg-tbb-orange/10 px-4 py-3">
          <Clock className="w-4 h-4 text-tbb-orange flex-none mt-0.5" aria-hidden />
          <div className="text-sm">
            <p className="font-bold text-tbb-navy">
              This lead has gone quiet —{" "}
              {daysSinceContact(prospect.lastContactAt, prospect.createdAt)}{" "}
              days since last contact.
            </p>
            <p className="text-tbb-ink-2 mt-0.5">
              Follow up, or set the stage to <strong>Lost</strong> so it stops
              sitting in the pipeline. Business Builders get a reminder about
              stale leads automatically.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — contact + deal + notes + signing */}
        <div className="lg:col-span-2 space-y-6">
          {/* Lead essentials — Owner / Program / Source, settable from the
              very first lead (always visible, every stage). */}
          <ProspectLeadEssentials
            prospectId={prospect.id}
            ownerUserProfileId={prospect.ownerUserProfileId}
            programType={prospect.programType}
            leadSource={prospect.leadSource}
            referrerName={prospect.referrerName}
            businessBuilders={businessBuilders}
          />

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
            </div>
          </section>

          {/* What's next — surfaces the obvious next move based on the
              current stage so Bruce always sees a clear suggested action. */}
          <ProspectNextStep status={prospect.status as ProspectStatus} />

          {/* Booking follow-through — only when this prospect came in via a
              booked session. The three-email NDA/paperwork sequence with the
              one toggle Bruce touches. */}
          {bookingFt && (
            <BookingFollowThroughPanel
              id={bookingFt.id}
              prospectId={prospect.id}
              sessionAtISO={bookingFt.sessionAt.toISOString()}
              email1SentAtISO={bookingFt.email1SentAt?.toISOString() ?? null}
              email2SentAtISO={bookingFt.email2SentAt?.toISOString() ?? null}
              email3SentAtISO={bookingFt.email3SentAt?.toISOString() ?? null}
              documentsReceived={Boolean(bookingFt.documentsReceivedAt)}
              cancelled={Boolean(bookingFt.cancelledAt)}
            />
          )}

          {/* Meeting prep — collapsible. Carries this lead's context into
              The Climb so its output can tie back here. */}
          <CollapsibleSection
            title="Prep with The Climb"
            storageKey="climb-prep"
            icon={<Mountain className="w-3.5 h-3.5" aria-hidden />}
          >
            <div className="p-5 space-y-3">
              <p className="text-sm text-tbb-ink-2">
                Open the meeting-prep kit — the Map of the Mountain, the four
                Building Blocks, and the companion tools.
              </p>
              <Link
                href={`/business-builder/the-climb?prospectId=${prospect.id}&company=${encodeURIComponent(prospect.companyName)}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
              >
                <Mountain className="w-3.5 h-3.5" aria-hidden />
                Open the prep kit
              </Link>
            </div>
          </CollapsibleSection>

          {/* Schedule a follow-up — collapsible. Sets the next-action date. */}
          <CollapsibleSection
            title={nextActionDateYmd ? "Follow-up" : "Schedule a follow-up"}
            storageKey="followup"
            icon={<CalendarClock className="w-3.5 h-3.5" aria-hidden />}
          >
            <ScheduleFollowupPanel
              prospectId={prospect.id}
              currentDate={nextActionDateYmd}
              currentTime={nextActionTime === "12:00" ? null : nextActionTime}
              currentLocation={prospect.nextActionLocation}
              currentNote={prospect.nextActionNote}
              embedded
            />
          </CollapsibleSection>

          {/* Schedule a meeting — its own drawer, right next to the
              follow-up, so booking a real session (with a Google Meet link
              + calendar invite) is as easy to find as setting a reminder.
              Open by default because it was previously buried in Quick
              actions and easy to miss. */}
          <CollapsibleSection
            title="Schedule a meeting"
            storageKey="schedule-meeting"
            defaultOpen
            icon={<Video className="w-3.5 h-3.5" aria-hidden />}
          >
            <div className="p-5">
              <ScheduleMeetingButton
                prospectId={prospect.id}
                companyName={prospect.companyName}
                recipientName={prospect.contactName}
              />
            </div>
          </CollapsibleSection>

          {/* Quick actions — collapsible, closed by default. */}
          <CollapsibleSection
            title="Quick actions"
            storageKey="quick-actions"
            icon={<Zap className="w-3.5 h-3.5" aria-hidden />}
          >
            <div className="p-5 space-y-4">
            <div>
              <StartRecordedSessionButton prospectId={prospect.id} />
            </div>
            {showSoulPreview && (
              <div className="border-t border-tbb-line-soft pt-4 space-y-2">
                <p className="text-xs text-tbb-ink-3">
                  If we&apos;ve already had Fireflies-recorded sessions with
                  this prospect, draft the Business Builder insights on them
                  — no engagement created, no portal invite sent. Pure
                  preview so you can see what we know before deciding to
                  formalize them.
                </p>
                <p className="text-xs text-tbb-ink-3">
                  <strong>How it finds the recording:</strong> virtual calls
                  match automatically on{" "}
                  {prospect.contactName ?? "the contact"}&apos;s email. For{" "}
                  <strong>in-person</strong> meetings Fireflies usually only
                  logs the coach, so title the recording{" "}
                  <span className="font-mono text-tbb-navy">
                    Prospect — {prospect.companyName}
                  </span>{" "}
                  and it&apos;ll be picked up.
                </p>
                <SoulFilePreviewButton prospectId={prospect.id} />
              </div>
            )}
            {/* Convert prospect → engagement. Appears once the contract
                is signed (or whenever Bruce wants to formalize). Carries
                program type, pricing tier, monthly fee, and start date
                across so the engagement form is pre-filled. */}
            {showConvert && !prospect.convertedEngagementId && (
              <div className="border-t border-tbb-line-soft pt-4 space-y-2">
                <p className="text-xs text-tbb-ink-3">
                  Ready to formalize this prospect into a paying
                  engagement? We&apos;ll create their engagement + portal
                  so you can prepare it now. No email is sent — you invite
                  the client to their portal separately when you&apos;re
                  ready.
                </p>
                <ActivateEngagementButton
                  prospectId={prospect.id}
                  currentProgram={prospect.programType}
                />
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
            </div>
          </CollapsibleSection>

          {/* Deal card — value / fee / next-action detail. Surfaces once
              the prospect is being qualified; leads use Lead essentials. */}
          {showDeal && (
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
          )}

          {/* QuickBooks customer link — drives the pipeline Value. Only
              relevant near/after signing, so hidden for early leads. */}
          {showQbo && (
            <ProspectQboCustomerPicker
              prospectId={prospect.id}
              customerId={prospect.qboCustomerId}
              customerName={prospect.qboCustomerName}
              lifetimePaymentsCents={prospect.qboLifetimePaymentsCents}
              syncedAt={prospect.qboValueSyncedAt?.toISOString() ?? null}
              linkedAt={prospect.qboLinkedAt?.toISOString() ?? null}
            />
          )}

          {/* Notes — collapsible. */}
          <CollapsibleSection
            title="Notes"
            storageKey="notes"
            icon={<StickyNote className="w-3.5 h-3.5" aria-hidden />}
            badge={prospect.notes ? undefined : "empty"}
          >
            <div className="p-5 space-y-3">
              <div className="flex justify-end">
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
            </div>
          </CollapsibleSection>

          {/* Signing — proposals/contracts. Hidden for early leads. */}
          {showSigning && (
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
          )}
        </div>

        {/* Right column — documents on file + team discussion + activity,
            all collapsible and closed by default. */}
        <aside className="lg:col-span-1 space-y-6">
          <CollapsibleSection
            title="Documents on file"
            storageKey="documents"
            icon={<FileText className="w-3.5 h-3.5" aria-hidden />}
            badge={prospectDocs.length || undefined}
          >
            <ProspectDocuments
              prospectId={prospect.id}
              documents={prospectDocs}
              embedded
            />
          </CollapsibleSection>
          <CollapsibleSection
            title="Team discussion"
            storageKey="team-discussion"
            icon={<MessageCircle className="w-3.5 h-3.5" aria-hidden />}
            badge={comments.length || undefined}
          >
            <ProspectComments
              prospectId={prospect.id}
              comments={comments}
              teammates={businessBuilders.filter(
                (b) => b.id !== profile.userProfileId,
              )}
              currentUserId={profile.userProfileId}
              isMasterAdmin={profile.role === "master_admin"}
              embedded
            />
          </CollapsibleSection>
          <CollapsibleSection
            title="Activity"
            storageKey="activity"
            icon={<Activity className="w-3.5 h-3.5" aria-hidden />}
            badge={activities.length || undefined}
          >
            <ProspectActivityTimeline
              prospectId={prospect.id}
              activities={activities}
              embedded
            />
          </CollapsibleSection>
        </aside>
      </div>

      {/* Full-width communications timeline — every email / SMS / WhatsApp /
          call note attached to this prospect. Collapsible, closed by default. */}
      <CollapsibleSection
        title="Communications"
        storageKey="communications"
        icon={<MessageSquare className="w-3.5 h-3.5" aria-hidden />}
        badge={communications.length || undefined}
      >
        <ClientCommunicationsPanel
          prospectId={prospect.id}
          contactName={prospect.contactName}
          contactEmail={prospect.contactEmail}
          contactPhone={prospect.phone}
          rows={communications}
          smsEnabled={isSmsConfigured()}
          emailTemplates={templates}
          embedded
        />
      </CollapsibleSection>

      {/* Archive this prospect (soft-delete) — collapsed by default; it's
          rarely used and destructive, so it stays out of the way until
          asked for. Recoverable from the Archived view. */}
      <CollapsibleSection
        title={prospect.archivedAt ? "Archived" : "Archive"}
        storageKey="archive"
        icon={<Archive className="w-3.5 h-3.5" aria-hidden />}
      >
        <div className="p-5 space-y-3">
          <p className="text-sm text-tbb-ink-2">
            {prospect.archivedAt
              ? "This prospect is archived and hidden from the pipeline. Restore it to bring it back, or — for a lead you\u2019re sure about — delete it permanently. Converted clients are archive-only."
              : "Archive removes this prospect from the pipeline but keeps the record, activity log, and communications — restore it anytime. For deals that didn't close, set Stage = Lost instead so they stay in the funnel history."}
          </p>
          <DeleteProspectButton
            prospectId={prospect.id}
            prospectLabel={prospect.companyName}
            archived={Boolean(prospect.archivedAt)}
            isClient={Boolean(prospect.convertedEngagementId)}
          />
        </div>
      </CollapsibleSection>
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
