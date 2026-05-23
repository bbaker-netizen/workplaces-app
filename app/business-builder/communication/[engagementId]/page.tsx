/**
 * Coach Communication page — same surface as the portal version, but
 * scoped to one engagement chosen via the URL parameter so coaches can
 * flip between clients.
 *
 * The Coach layout role-gates this to master_admin (and a future 'Coach'
 * role); that gate is shared at /business-builder/layout.tsx.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachEngagements } from "@/lib/db/queries/engagements";
import { listForEngagement } from "@/lib/db/queries/client-communications";
import { engagements as engagementsTable, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { MessageThread } from "@/components/communication/MessageThread";
import { RecentActivity } from "@/components/communication/RecentActivity";
import { ClientCommunicationsPanel } from "@/components/communications/ClientCommunicationsPanel";
import { isSmsConfigured } from "@/lib/integrations/twilio";
import {
  THREAD_TYPE,
  canViewThread,
} from "@/lib/communication/audience";

export default async function CoachCommunicationPage({
  params,
  searchParams,
}: {
  params: { engagementId: string };
  searchParams: { tab?: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const engagements = await listCoachEngagements();
  const engagement = engagements.find((e) => e.id === params.engagementId);
  if (!engagement) notFound();

  // Look up the client lead for default-to-fields in the external composer.
  // Falls back to no defaults if the engagement has no client_lead row yet.
  const [communications, clientLead] = await Promise.all([
    listForEngagement(engagement.id),
    withSystemContext(async (tx) => {
      const [eng] = await tx
        .select({ orgId: engagementsTable.orgId })
        .from(engagementsTable)
        .where(eq(engagementsTable.id, engagement.id))
        .limit(1);
      if (!eng) return null;
      const [lead] = await tx
        .select({
          name: userProfiles.fullName,
          email: userProfiles.email,
        })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.orgId, eng.orgId),
            eq(userProfiles.role, "client_lead"),
          ),
        )
        .limit(1);
      return lead ?? null;
    }),
  ]);

  const showLeadership = canViewThread(
    THREAD_TYPE.engagementLeadership,
    profile.role,
  );

  const tab = searchParams?.tab === "team" ? "team" : "leadership";

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 sm:py-12 space-y-10">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {engagement.name ?? "Engagement"}
        </h1>
        <nav className="flex gap-3 text-xs font-mono uppercase tracking-tbb-caps">
          <Link
            href="/business-builder"
            className="text-muted-foreground hover:text-foreground"
          >
            ← Coach
          </Link>
          {engagements.length > 1 && (
            <details className="relative">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none">
                Switch engagement
              </summary>
              <div className="absolute left-0 mt-2 z-10 bg-white border border-tbb-line rounded-md shadow-md py-1 min-w-[14rem]">
                {engagements.map((e) => (
                  <Link
                    key={e.id}
                    href={`/business-builder/communication/${e.id}`}
                    className="block px-3 py-1.5 text-foreground hover:bg-tbb-cream-50 normal-case tracking-normal font-sans text-sm"
                  >
                    {e.name ?? e.id.slice(0, 8)}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </nav>
      </header>

      <section className="space-y-3">
        <h2 className="font-bold text-foreground text-xl tracking-tight">
          Recent activity
        </h2>
        <RecentActivity engagementId={engagement.id} scope="coach" />
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-foreground text-xl tracking-tight">
          External communications
        </h2>
        <p className="text-xs text-tbb-ink-3">
          Every email, text, WhatsApp message, and call note captured for{" "}
          {engagement.name ?? "this engagement"} — across all members on the
          client&apos;s side.
        </p>
        <ClientCommunicationsPanel
          engagementId={engagement.id}
          contactName={clientLead?.name ?? null}
          contactEmail={clientLead?.email ?? null}
          contactPhone={null}
          rows={communications}
          smsEnabled={isSmsConfigured()}
        />
      </section>

      <section className="space-y-4">
        <div role="tablist" className="flex gap-1 border-b border-tbb-line">
          {showLeadership && (
            <a
              role="tab"
              aria-selected={tab === "leadership"}
              href="?tab=leadership"
              className={
                "font-sans text-sm uppercase tracking-tbb-caps px-4 py-2 -mb-px border-b-2 transition-colors " +
                (tab === "leadership"
                  ? "border-tbb-navy text-foreground font-bold"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              Leadership
            </a>
          )}
          <a
            role="tab"
            aria-selected={tab === "team"}
            href="?tab=team"
            className={
              "font-sans text-sm uppercase tracking-tbb-caps px-4 py-2 -mb-px border-b-2 transition-colors " +
              (tab === "team"
                ? "border-tbb-navy text-foreground font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            Team
          </a>
        </div>

        {tab === "leadership" && showLeadership ? (
          <div className="pt-2">
            <p className="font-sans text-xs text-muted-foreground italic mb-4">
              Private — only the Business Builder, owner, and managers see this.
            </p>
            <MessageThread
              engagementId={engagement.id}
              threadType={THREAD_TYPE.engagementLeadership}
              parentEntityId={engagement.id}
              composerPlaceholder="Leadership-only message…"
            />
          </div>
        ) : (
          <div className="pt-2">
            <p className="font-sans text-xs text-muted-foreground italic mb-4">
              Visible to everyone on the engagement.
            </p>
            <MessageThread
              engagementId={engagement.id}
              threadType={THREAD_TYPE.engagementTeam}
              parentEntityId={engagement.id}
              composerPlaceholder="Message the team…"
            />
          </div>
        )}
      </section>
    </main>
  );
}
