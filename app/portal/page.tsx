/**
 * /portal — engagement dashboard ("Today" view).
 *
 * Phase 1.8. Aggregator: pulls one batched query per module so the
 * client sees their next session, their open action items, and the
 * latest activity in one place. Each card links into the deep module.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, MessageSquare, Calendar, FileText, Sparkles } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementActionItems } from "@/lib/db/queries/action-items";
import { getNextSession } from "@/lib/db/queries/bbs-sessions";
import { listEngagementRecentActivity } from "@/lib/db/queries/messages";
import { listEngagementDocuments } from "@/lib/db/queries/documents";
import { getSoulFileForEngagement } from "@/lib/db/queries/soul-files";
import { TOMBSTONE_BODY } from "@/lib/communication/tombstone";
import {
  formatSessionTime,
  SESSION_TYPE_LABEL,
} from "@/components/sessions/utils";

export default async function PortalDashboard({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  // Business Builders should land on their console by default. But the
  // "Portal view" link in the console passes ?preview=1 so coaches can
  // peek at what a client would see without getting redirected away.
  const sp = await searchParams;
  const isPreview = sp.preview === "1";
  if (
    !isPreview &&
    (profile.role === "master_admin" || profile.role === "coach")
  ) {
    redirect("/business-builder");
  }

  const engagement = await getCurrentEngagement();
  if (!engagement) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-bold text-foreground text-3xl tracking-tight">
          No engagement yet
        </h1>
        <p className="mt-4 font-sans text-muted-foreground">
          Your portal isn&apos;t bound to an engagement. If you expect access,
          contact your Business Builder.
        </p>
      </main>
    );
  }

  // Five batched reads. Each is independent — Promise.all to overlap.
  const [allItems, nextSession, recent, documents, soulFile] =
    await Promise.all([
      listEngagementActionItems(engagement.id),
      getNextSession(engagement.id),
      listEngagementRecentActivity(engagement.id, 5),
      listEngagementDocuments(engagement.id),
      getSoulFileForEngagement(engagement.id),
    ]);

  // Coach roles were redirected to /business-builder above, so by this point the
  // viewer is always a client-side role and "draft" items stay hidden.
  const now = new Date();
  const myOpen = allItems
    .filter(
      (i) =>
        i.assigneeUserProfileId === profile.userProfileId &&
        i.status !== "done" &&
        i.status !== "draft",
    )
    .sort((a, b) => {
      const aOverdue = a.dueDate && a.dueDate < now ? 0 : 1;
      const bOverdue = b.dueDate && b.dueDate < now ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      const aTime = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 5);

  const recentDocs = documents.slice(0, 3);
  const greeting = greetingFor(new Date());

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 sm:py-12 space-y-10">
      {isPreview && (
        <div className="border border-tbb-warning/40 bg-tbb-warning/10 text-tbb-ink-2 rounded-md px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-warning">
            Preview
          </span>
          <span>
            You&apos;re viewing the client portal as a client would see it.
          </span>
          <Link
            href="/business-builder"
            className="ml-auto text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
          >
            ← Back to Business Builder Console
          </Link>
        </div>
      )}
      <header className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {greeting}, {profile.fullName.split(" ")[0] ?? profile.fullName}.
        </h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Next session card */}
        <Card
          tourId="next-session"
          icon={<Calendar className="w-4 h-4" aria-hidden />}
          title="Next session"
          href="/portal/sessions"
          ctaLabel="All sessions"
        >
          {nextSession ? (
            <div className="space-y-1">
              <p className="font-bold text-foreground text-xl tracking-tight">
                {formatSessionTime(nextSession.scheduledAt)}
              </p>
              <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                {SESSION_TYPE_LABEL[nextSession.type]}
              </p>
              {nextSession.notes && (
                <p className="mt-2 font-sans text-sm text-muted-foreground line-clamp-3">
                  {nextSession.notes}
                </p>
              )}
            </div>
          ) : (
            <p className="font-sans text-sm text-muted-foreground italic">
              Nothing scheduled. Head to Sessions to add one.
            </p>
          )}
        </Card>

        {/* Action items */}
        <Card
          tourId="action-items"
          icon={<CheckCircle2 className="w-4 h-4" aria-hidden />}
          title="Your open items"
          href="/portal/action-items"
          ctaLabel="All action items"
        >
          {myOpen.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground italic">
              Nothing on your plate right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {myOpen.map((it) => {
                const isOverdue =
                  it.dueDate &&
                  it.dueDate < now &&
                  it.status !== "done";
                return (
                  <li key={it.id}>
                    <Link
                      href={`/portal/action-items/${it.id}`}
                      className={
                        "block py-1.5 pl-3 border-l-2 group hover:bg-tbb-cream-50 transition-colors " +
                        (isOverdue ? "border-tbb-danger" : "border-transparent")
                      }
                    >
                      <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                        <span className="font-sans text-sm font-bold text-foreground group-hover:underline underline-offset-4">
                          {it.title}
                        </span>
                        {it.dueDate && (
                          <span
                            className={
                              "font-mono text-[10px] uppercase tracking-tbb-caps " +
                              (isOverdue
                                ? "text-tbb-danger font-bold"
                                : "text-muted-foreground")
                            }
                          >
                            Due{" "}
                            {it.dueDate.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Recent communication */}
        <Card
          tourId="communication"
          icon={<MessageSquare className="w-4 h-4" aria-hidden />}
          title="Latest activity"
          href="/portal/communication"
          ctaLabel="Open communication"
        >
          {recent.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground italic">
              No messages yet. Start a conversation in Communication.
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map(({ message, parentTitle }) => (
                <li
                  key={message.id}
                  className="border-l-2 border-transparent pl-3"
                >
                  <p className="font-sans text-sm">
                    <span className="font-bold text-foreground">
                      {message.authorName}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      in {parentTitle}:
                    </span>
                  </p>
                  <p className="mt-0.5 font-sans text-sm text-muted-foreground line-clamp-2">
                    {message.body === TOMBSTONE_BODY
                      ? "[Message deleted]"
                      : flatten(message.body)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Soul file */}
        <Card
          tourId="soul-file"
          icon={<Sparkles className="w-4 h-4" aria-hidden />}
          title="Soul File"
          href="/portal/soul-file"
          ctaLabel="Open Soul File"
        >
          {soulFile && soulFile.body.trim().length > 0 ? (
            <div className="space-y-2">
              <p className="font-sans text-sm text-muted-foreground line-clamp-4">
                {flatten(soulFile.body)}
              </p>
              {soulFile.lastEditorName && (
                <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                  Last edited by {soulFile.lastEditorName}
                </p>
              )}
            </div>
          ) : (
            <p className="font-sans text-sm text-muted-foreground italic">
              Empty for now. The Soul File is the deep context for this
              engagement.
            </p>
          )}
        </Card>

        {/* Recent documents */}
        <Card
          tourId="documents"
          icon={<FileText className="w-4 h-4" aria-hidden />}
          title="Recent documents"
          href="/portal/documents"
          ctaLabel="All documents"
          className="lg:col-span-2"
        >
          {recentDocs.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground italic">
              No files uploaded yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recentDocs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                >
                  <Link
                    href={`/api/documents/${d.id}/download`}
                    className="font-sans text-sm text-foreground hover:underline underline-offset-4 truncate max-w-full"
                  >
                    {d.originalFilename}
                  </Link>
                  <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {d.uploaderName}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {d.createdAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}

function Card({
  tourId,
  icon,
  title,
  href,
  ctaLabel,
  children,
  className,
}: {
  tourId?: string;
  icon: React.ReactNode;
  title: string;
  href: string;
  ctaLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      data-tour={tourId}
      className={
        "border border-tbb-line rounded-md bg-white p-5 space-y-3 " +
        (className ?? "")
      }
    >
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps">
            {title}
          </h2>
        </div>
        <Link
          href={href}
          className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          {ctaLabel} →
        </Link>
      </header>
      {children}
    </section>
  );
}

function greetingFor(d: Date): string {
  const hour = d.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function flatten(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_+([^_]+)_+/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
