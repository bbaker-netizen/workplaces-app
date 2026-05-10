/**
 * Coach Console — cross-engagement dashboard.
 *
 * Phase 2.5. Aggregates everything Bruce needs to see across all his
 * engagements at once: upcoming sessions, projects in flight,
 * candidates in pipeline, deliverables status, subscription
 * inventory.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Briefcase,
  Calendar,
  CheckSquare,
  CreditCard,
  FileText,
  Filter,
  Plus,
  Target,
  UserCheck,
  Users,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachEngagements } from "@/lib/db/queries/engagements";
import { listCoachActionItems } from "@/lib/db/queries/action-items";
import {
  listCoachDeliverables,
  listCoachGoals,
  listCoachHires,
  listCoachProjects,
  listCoachSubscriptions,
  listCoachUpcomingSessions,
} from "@/lib/db/queries/coach-cross-engagement";
import { listProspects } from "@/lib/db/queries/prospects";
import { formatSessionTime } from "@/components/sessions/utils";

export default async function CoachConsole() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const [
    engagements,
    actionItems,
    upcomingSessions,
    projects,
    hires,
    deliverables,
    goals,
    subscriptions,
    prospects,
  ] = await Promise.all([
    listCoachEngagements(),
    listCoachActionItems(),
    listCoachUpcomingSessions(),
    listCoachProjects(),
    listCoachHires(),
    listCoachDeliverables(),
    listCoachGoals(),
    listCoachSubscriptions(),
    listProspects(),
  ]);

  const activeProspects = prospects.filter(
    (p) => p.status !== "onboarded" && p.status !== "lost",
  );

  const now = new Date();
  const myWork = actionItems
    .filter(
      (i) =>
        i.assigneeUserProfileId === profile.userProfileId &&
        i.status !== "done" &&
        i.status !== "draft",
    )
    .sort((a, b) => {
      const ao = a.dueDate && a.dueDate < now ? 0 : 1;
      const bo = b.dueDate && b.dueDate < now ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const at = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      const bt = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      return at - bt;
    })
    .slice(0, 8);

  const activeProjects = projects.filter(
    (p) => p.status === "active" || p.status === "planning",
  );
  const activeHires = hires.filter(
    (h) => h.status !== "hired" && h.status !== "declined",
  );
  const inflightDeliverables = deliverables.filter(
    (d) =>
      d.status === "in_progress" ||
      d.status === "review" ||
      d.status === "not_started",
  );
  const overdueGoals = goals.filter(
    (g) =>
      g.targetDate &&
      g.targetDate < now &&
      g.status !== "achieved" &&
      g.status !== "abandoned",
  );
  const subsRunRate = subscriptions.reduce(
    (s, x) => s + Number(x.monthlyCostCents),
    0,
  );

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-10 sm:py-12 space-y-10">
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Coach Console
            </p>
            <h1 className="font-display font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
              Hey {profile.fullName.split(" ")[0] ?? profile.fullName}.
            </h1>
            <p className="font-sans text-sm text-muted-foreground">
              {engagements.length} engagement{engagements.length === 1 ? "" : "s"} active.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/coach/engagements/new"
              className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057]"
            >
              <Plus className="w-4 h-4" aria-hidden /> New engagement
            </Link>
            <Link
              href="/portal"
              className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Portal view
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card
            icon={<CheckSquare className="w-4 h-4" aria-hidden />}
            title="My work"
            href="/coach/action-items"
            cta="Open"
            className="lg:col-span-2"
          >
            {myWork.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground italic">
                Nothing on your plate. Maybe go for a walk.
              </p>
            ) : (
              <ul className="space-y-1">
                {myWork.map((it) => {
                  const overdue =
                    it.dueDate &&
                    it.dueDate < now &&
                    it.status !== "done";
                  return (
                    <li key={it.id}>
                      <Link
                        href={`/coach/action-items/${it.id}`}
                        className={
                          "block py-1.5 pl-3 border-l-2 group hover:bg-[#F5F1E8] transition-colors " +
                          (overdue ? "border-[#E87722]" : "border-transparent")
                        }
                      >
                        <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                          <span className="font-sans text-sm font-bold text-foreground group-hover:underline underline-offset-4">
                            {it.title}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                            {it.engagementName ?? "Engagement"}
                          </span>
                          {it.dueDate && (
                            <span
                              className={
                                "ml-auto font-mono text-[10px] uppercase tracking-[0.15em] " +
                                (overdue
                                  ? "text-[#E87722] font-bold"
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

          <Card
            icon={<Calendar className="w-4 h-4" aria-hidden />}
            title="Upcoming sessions"
            href="/coach"
            cta="Open"
          >
            {upcomingSessions.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground italic">
                Nothing scheduled.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {upcomingSessions.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                    <Link
                      href={`/coach/sessions/${s.engagementId}/${s.id}`}
                      className="font-sans text-sm font-bold text-foreground hover:underline underline-offset-4"
                    >
                      {formatSessionTime(s.scheduledAt)}
                    </Link>
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {s.engagementName ?? s.type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            icon={<Briefcase className="w-4 h-4" aria-hidden />}
            title={`Projects · ${activeProjects.length}`}
            href="/coach/projects"
            cta="All projects"
          >
            {activeProjects.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground italic">
                No active projects.
              </p>
            ) : (
              <ul className="space-y-1">
                {activeProjects.slice(0, 5).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                  >
                    <span className="font-sans text-sm font-bold text-foreground">
                      {p.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {p.engagementName}
                    </span>
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {p.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            icon={<Filter className="w-4 h-4" aria-hidden />}
            title={`Pipeline · ${activeProspects.length}`}
            href="/coach/pipeline"
            cta="All prospects"
          >
            {activeProspects.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground italic">
                No prospects in flight.
              </p>
            ) : (
              <ul className="space-y-1">
                {activeProspects.slice(0, 5).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                  >
                    <Link
                      href={`/coach/pipeline/${p.id}`}
                      className="font-sans text-sm font-bold text-foreground hover:underline underline-offset-4"
                    >
                      {p.companyName}
                    </Link>
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {p.contactName ?? p.contactEmail}
                    </span>
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {p.status.replace(/_/g, " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            icon={<UserCheck className="w-4 h-4" aria-hidden />}
            title={`Hiring · ${activeHires.length}`}
            href="/coach/hiring"
            cta="All candidates"
          >
            {activeHires.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground italic">
                No candidates in flight.
              </p>
            ) : (
              <ul className="space-y-1">
                {activeHires.slice(0, 5).map((h) => (
                  <li
                    key={h.id}
                    className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                  >
                    <span className="font-sans text-sm font-bold text-foreground">
                      {h.candidateName}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {h.engagementName} · {h.roleName}
                    </span>
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {h.status.replace("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            icon={<FileText className="w-4 h-4" aria-hidden />}
            title={`Deliverables · ${inflightDeliverables.length}`}
            href="/coach/deliverables"
            cta="All deliverables"
          >
            {inflightDeliverables.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground italic">
                Nothing in flight.
              </p>
            ) : (
              <ul className="space-y-1">
                {inflightDeliverables.slice(0, 5).map((d) => (
                  <li
                    key={d.id}
                    className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                  >
                    <span className="font-sans text-sm font-bold text-foreground">
                      {d.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {d.engagementName}
                    </span>
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {d.status.replace("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            icon={<Target className="w-4 h-4" aria-hidden />}
            title={`Goals · ${overdueGoals.length} past target`}
            href="/coach/goals"
            cta="All goals"
          >
            {overdueGoals.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground italic">
                Goals on track.
              </p>
            ) : (
              <ul className="space-y-1">
                {overdueGoals.slice(0, 5).map((g) => (
                  <li
                    key={g.id}
                    className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                  >
                    <span className="font-sans text-sm font-bold text-foreground">
                      {g.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {g.engagementName}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            icon={<CreditCard className="w-4 h-4" aria-hidden />}
            title="Subscriptions"
            href="/coach/subscriptions"
            cta="All assets"
          >
            <p className="font-display font-bold text-foreground text-2xl tracking-tight">
              ${(subsRunRate / 100).toFixed(2)}<span className="font-mono text-xs text-muted-foreground"> / mo</span>
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {subscriptions.length} services across {engagements.length} engagement
              {engagements.length === 1 ? "" : "s"}
            </p>
          </Card>

          <Card
            icon={<Users className="w-4 h-4" aria-hidden />}
            title="Engagements"
            href="/coach/engagements/new"
            cta="+ New"
          >
            {engagements.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground italic">
                No engagements yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {engagements.slice(0, 5).map((e) => (
                  <li
                    key={e.id}
                    className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                  >
                    <span className="font-sans text-sm font-bold text-foreground">
                      {e.name ?? "Engagement"}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {e.type} · {e.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}

function Card({
  icon,
  title,
  href,
  cta,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  cta: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "border border-[#CCCCCC] rounded-md bg-white p-5 space-y-3 " +
        (className ?? "")
      }
    >
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em]">
            {title}
          </h2>
        </div>
        <Link
          href={href}
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          {cta} →
        </Link>
      </header>
      {children}
    </section>
  );
}
