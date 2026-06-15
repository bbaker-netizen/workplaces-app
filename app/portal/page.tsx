/**
 * /portal — engagement dashboard ("Today" view).
 *
 * Phase 1.8, refreshed Phase 5. Aggregator: one batched read per module so
 * the client sees their next session, open action items, active projects,
 * latest conversation, and recent documents in one place — each card links
 * into the deep module. A stat strip up top gives an at-a-glance pulse.
 */

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  MessageSquare,
  Calendar,
  FileText,
  Briefcase,
  Clock,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  getCurrentEngagement,
  PORTAL_PREVIEW_COOKIE,
} from "@/lib/db/queries/engagements";
import { listEngagementActionItems } from "@/lib/db/queries/action-items";
import { getNextSession } from "@/lib/db/queries/bbs-sessions";
import { listEngagementRecentActivity } from "@/lib/db/queries/messages";
import { listEngagementDocuments } from "@/lib/db/queries/documents";
import { listEngagementProjects } from "@/lib/db/queries/projects";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { TOMBSTONE_BODY } from "@/lib/communication/tombstone";
import {
  formatSessionTime,
  SESSION_TYPE_LABEL,
} from "@/components/sessions/utils";

const INACTIVE_PROJECT = new Set(["done", "closed", "cancelled"]);

export default async function PortalDashboard() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const isPreview = cookies().get(PORTAL_PREVIEW_COOKIE)?.value === "1";

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

  // Five batched reads — all independent, overlapped with Promise.all.
  const [allItems, nextSession, recent, documents, projectList] =
    await Promise.all([
      listEngagementActionItems(engagement.id),
      getNextSession(engagement.id),
      listEngagementRecentActivity(engagement.id, 5),
      listEngagementDocuments(engagement.id),
      listEngagementProjects(engagement.id),
    ]);

  const now = new Date();
  const myOpenAll = allItems.filter(
    (i) =>
      i.assigneeUserProfileId === profile.userProfileId &&
      i.status !== "done" &&
      i.status !== "draft",
  );
  const myOpen = [...myOpenAll]
    .sort((a, b) => {
      const aOverdue = a.dueDate && a.dueDate < now ? 0 : 1;
      const bOverdue = b.dueDate && b.dueDate < now ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      const aTime = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 5);
  const overdueCount = myOpenAll.filter(
    (i) => i.dueDate && i.dueDate < now,
  ).length;

  const activeProjects = projectList.filter(
    (p) => !INACTIVE_PROJECT.has(p.status),
  );
  const recentDocs = documents.slice(0, 3);
  const greeting = greetingFor(new Date());

  let greetingName = profile.fullName.split(" ")[0] ?? profile.fullName;
  if (isPreview) {
    const members = await listEngagementMembers(engagement.id);
    const client =
      members.find((m) => m.role === "client_lead") ??
      members.find(
        (m) => m.role === "client_manager" || m.role === "client_employee",
      );
    greetingName = client?.fullName
      ? (client.fullName.split(" ")[0] ?? client.fullName)
      : (engagement.name ?? "there");
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 sm:py-12 space-y-8">
      {isPreview && (
        <div className="border border-tbb-warning/40 bg-tbb-warning/10 text-tbb-ink-2 rounded-md px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-warning">
            Preview
          </span>
          <span>
            Previewing{" "}
            <span className="font-bold">{engagement.name ?? "this client"}</span>
            &rsquo;s portal as the client sees it.
          </span>
          <Link
            href="/business-builder"
            className="ml-auto text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
          >
            ← Back to Business Builder Console
          </Link>
        </div>
      )}

      {/* Hero band — warm, branded, sets the tone instead of a bare line. */}
      <header className="rounded-xl bg-tbb-navy text-tbb-cream px-6 py-7 sm:px-8 sm:py-9 shadow-tbb-sm">
        <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-blue-light">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="mt-1 font-display font-bold text-3xl sm:text-4xl tracking-tight leading-none">
          {greeting}, {greetingName}.
        </h1>
        <p className="mt-2 font-sans text-sm text-tbb-cream/70 max-w-xl">
          Here&apos;s where things stand with your business build today.
        </p>
      </header>

      {/* Stat strip — at-a-glance pulse. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          icon={<Calendar className="w-4 h-4" aria-hidden />}
          label="Next session"
          value={nextSession ? formatSessionTime(nextSession.scheduledAt) : "—"}
          href="/portal/sessions"
          small
        />
        <Stat
          icon={<CheckCircle2 className="w-4 h-4" aria-hidden />}
          label="Open items"
          value={String(myOpenAll.length)}
          accent={overdueCount > 0 ? "orange" : undefined}
          hint={overdueCount > 0 ? `${overdueCount} overdue` : undefined}
          href="/portal/action-items"
        />
        <Stat
          icon={<Briefcase className="w-4 h-4" aria-hidden />}
          label="Active projects"
          value={String(activeProjects.length)}
          href="/portal/projects"
        />
        <Stat
          icon={<FileText className="w-4 h-4" aria-hidden />}
          label="Documents"
          value={String(documents.length)}
          href="/portal/documents"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
              <p className="font-display font-bold text-foreground text-2xl tracking-tight">
                {formatSessionTime(nextSession.scheduledAt)}
              </p>
              <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-blue">
                {SESSION_TYPE_LABEL[nextSession.type]}
              </p>
              {nextSession.notes && (
                <p className="mt-2 font-sans text-sm text-muted-foreground line-clamp-3">
                  {nextSession.notes}
                </p>
              )}
            </div>
          ) : (
            <EmptyLine>Nothing scheduled yet.</EmptyLine>
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
            <EmptyLine>Nothing on your plate right now. 🎉</EmptyLine>
          ) : (
            <ul className="space-y-1">
              {myOpen.map((it) => {
                const isOverdue =
                  it.dueDate && it.dueDate < now && it.status !== "done";
                return (
                  <li key={it.id}>
                    <Link
                      href={`/portal/action-items/${it.id}`}
                      className={
                        "block py-1.5 pl-3 border-l-2 rounded-r group hover:bg-tbb-cream-50 transition-colors " +
                        (isOverdue ? "border-tbb-orange" : "border-tbb-line")
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
                                ? "text-tbb-orange font-bold"
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

        {/* Active projects */}
        <Card
          tourId="projects"
          icon={<Briefcase className="w-4 h-4" aria-hidden />}
          title="Active projects"
          href="/portal/projects"
          ctaLabel="All projects"
        >
          {activeProjects.length === 0 ? (
            <EmptyLine>No active projects right now.</EmptyLine>
          ) : (
            <ul className="space-y-3">
              {activeProjects.slice(0, 4).map((p) => {
                const pct =
                  p.taskCount > 0
                    ? Math.round((p.taskCountDone / p.taskCount) * 100)
                    : 0;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/portal/projects/${p.id}`}
                      className="block group"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-sans text-sm font-bold text-foreground group-hover:underline underline-offset-4 truncate">
                          {p.name}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground shrink-0">
                          {p.taskCount > 0
                            ? `${p.taskCountDone}/${p.taskCount}`
                            : p.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      {p.taskCount > 0 && (
                        <div className="mt-1.5 h-1.5 rounded-full bg-tbb-cream-50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-tbb-blue"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
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
            <EmptyLine>No messages yet — start a conversation.</EmptyLine>
          ) : (
            <ul className="space-y-2.5">
              {recent.map(({ message, parentTitle }) => (
                <li
                  key={message.id}
                  className="border-l-2 border-tbb-line pl-3"
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
            <EmptyLine>No files uploaded yet.</EmptyLine>
          ) : (
            <ul className="space-y-1.5">
              {recentDocs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                >
                  <Link
                    href={`/api/documents/${d.id}/download`}
                    className="font-sans text-sm font-bold text-foreground hover:underline underline-offset-4 truncate max-w-full"
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

function Stat({
  icon,
  label,
  value,
  href,
  accent,
  hint,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
  accent?: "orange";
  hint?: string;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-tbb-line bg-white px-4 py-3 hover:border-tbb-blue/50 hover:shadow-tbb-sm transition-all"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span
          className={
            "grid place-items-center w-6 h-6 rounded-md " +
            (accent === "orange"
              ? "bg-tbb-orange/15 text-tbb-orange"
              : "bg-tbb-blue/10 text-tbb-blue")
          }
        >
          {icon}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-tbb-caps">
          {label}
        </span>
      </div>
      <p
        className={
          "mt-1.5 font-display font-bold tracking-tight text-foreground " +
          (small ? "text-base leading-tight" : "text-3xl leading-none")
        }
      >
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-orange font-bold">
          {hint}
        </p>
      )}
    </Link>
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
        "border border-tbb-line rounded-xl bg-white p-5 space-y-3 shadow-tbb-sm " +
        (className ?? "")
      }
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-8 h-8 rounded-md bg-tbb-blue/10 text-tbb-blue">
            {icon}
          </span>
          <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-ink-2">
            {title}
          </h2>
        </div>
        <Link
          href={href}
          className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground hover:text-tbb-blue underline-offset-4 hover:underline"
        >
          {ctaLabel} →
        </Link>
      </header>
      {children}
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-sm text-muted-foreground italic flex items-center gap-1.5">
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden />
      {children}
    </p>
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
