/**
 * Portal Communication page.
 *
 * Three sections (mobile-first stacked):
 *   1. Recent Activity — latest messages across every audience-allowed
 *      thread in this engagement.
 *   2. Leadership thread — visible to leadership roles only. Hidden
 *      entirely from client_employee.
 *   3. Team thread — visible to everyone in the engagement.
 *
 * `?tab=leadership|team` opens the matching thread expanded; absent
 * defaults to "team" so client_employee never lands on a 404 if a
 * deep link goes stale.
 */

import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { MessageThread } from "@/components/communication/MessageThread";
import { RecentActivity } from "@/components/communication/RecentActivity";
import {
  THREAD_TYPE,
  canViewThread,
} from "@/lib/communication/audience";

export default async function PortalCommunicationPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();
  if (!engagement) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-4">
        <h1 className="font-display font-bold text-foreground text-3xl tracking-tight">
          Communication
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          No engagement is associated with your account yet. Once your
          coach activates one, conversations will live here.
        </p>
      </main>
    );
  }

  const showLeadership = canViewThread(
    THREAD_TYPE.engagementLeadership,
    profile.role,
  );

  const tab = searchParams?.tab === "leadership" && showLeadership
    ? "leadership"
    : "team";

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 sm:py-12 space-y-10">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-display font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          Communication
        </h1>
      </header>

      <section className="space-y-3">
        <h2 className="font-display font-bold text-foreground text-xl tracking-tight">
          Recent activity
        </h2>
        <RecentActivity engagementId={engagement.id} scope="portal" />
      </section>

      <section className="space-y-4">
        <div role="tablist" className="flex gap-1 border-b border-[#CCCCCC]">
          {showLeadership && (
            <a
              role="tab"
              aria-selected={tab === "leadership"}
              href="?tab=leadership"
              className={
                "font-sans text-sm uppercase tracking-[0.15em] px-4 py-2 -mb-px border-b-2 transition-colors " +
                (tab === "leadership"
                  ? "border-[#1A1A1A] text-foreground font-bold"
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
              "font-sans text-sm uppercase tracking-[0.15em] px-4 py-2 -mb-px border-b-2 transition-colors " +
              (tab === "team"
                ? "border-[#1A1A1A] text-foreground font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            Team
          </a>
        </div>

        {tab === "leadership" && showLeadership ? (
          <div className="pt-2">
            <p className="font-sans text-xs text-muted-foreground italic mb-4">
              Private thread — visible to coach, owner, and managers only.
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
