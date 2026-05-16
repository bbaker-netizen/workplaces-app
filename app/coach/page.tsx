/**
 * Business Builder Console — customizable home dashboard.
 *
 * Phase 5: replaces the fixed 9-card grid with a Monday-style canvas
 * where each card can be resized, rearranged, removed, or hidden. The
 * layout is stored on user_profiles.home_dashboard_layout so it follows
 * you across devices.
 *
 * Data fetching stays server-side — every card's content is pre-rendered
 * here and passed as a ReactNode into <HomeDashboard>. The client wrapper
 * only owns layout state.
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
  TrendingUp,
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
import { getCurrentUserPrefs } from "@/lib/db/queries/user-prefs";
import { formatSessionTime } from "@/components/sessions/utils";
import {
  HomeDashboard,
  type DashboardCard,
} from "@/components/home/HomeDashboard";

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
    prefs,
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
    getCurrentUserPrefs(),
  ]);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const activeProspects = prospects.filter(
    (p) => p.status !== "onboarded" && p.status !== "lost",
  );
  const newLeads = prospects.filter(
    (p) =>
      (p.status === "new_lead" || p.status === "first_contact") &&
      p.createdAt >= sevenDaysAgo,
  );
  const negotiationProspects = prospects.filter(
    (p) => p.status === "negotiation",
  );
  const pipelineValue = activeProspects.reduce(
    (s, p) => s + (p.expectedValueCents ?? 0),
    0,
  );

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

  const cards: DashboardCard[] = [
    {
      type: "my_work",
      label: "My work",
      defaultSize: "large",
      node: (
        <CardShell
          icon={<CheckSquare className="w-4 h-4" aria-hidden />}
          title="My work"
          href="/coach/action-items"
          cta="Open"
        >
          {myWork.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nothing on your plate. Maybe go for a walk.
            </p>
          ) : (
            <ul className="space-y-1">
              {myWork.map((it) => {
                const overdue =
                  it.dueDate && it.dueDate < now && it.status !== "done";
                return (
                  <li key={it.id}>
                    <Link
                      href={`/coach/action-items/${it.id}`}
                      className={
                        "block py-1.5 pl-3 border-l-2 group hover:bg-tbb-cream-50 transition-colors " +
                        (overdue ? "border-tbb-danger" : "border-transparent")
                      }
                    >
                      <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                        <span className="text-sm font-bold text-foreground group-hover:underline underline-offset-4">
                          {it.title}
                        </span>
                        <span className="text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                          {it.engagementName ?? "Engagement"}
                        </span>
                        {it.dueDate && (
                          <span
                            className={
                              "ml-auto text-[10px] uppercase tracking-tbb-caps " +
                              (overdue
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
        </CardShell>
      ),
    },
    {
      type: "new_leads",
      label: "New leads (last 7 days)",
      defaultSize: "small",
      node: (
        <CardShell
          icon={<TrendingUp className="w-4 h-4" aria-hidden />}
          title={`New leads · ${newLeads.length}`}
          href="/coach/pipeline"
          cta="Open"
          accent="orange"
        >
          {newLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No new leads this week.
            </p>
          ) : (
            <ul className="space-y-1">
              {newLeads.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                  <Link
                    href={`/coach/pipeline/${p.id}`}
                    className="text-sm font-bold text-foreground hover:underline underline-offset-4"
                  >
                    {p.companyName}
                  </Link>
                  <span className="text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {p.leadSource ?? "Web form"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      ),
    },
    {
      type: "negotiation",
      label: "Prospects in negotiation",
      defaultSize: "small",
      node: (
        <CardShell
          icon={<Filter className="w-4 h-4" aria-hidden />}
          title={`In negotiation · ${negotiationProspects.length}`}
          href="/coach/pipeline"
          cta="Open"
        >
          {negotiationProspects.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No active negotiations.
            </p>
          ) : (
            <ul className="space-y-1">
              {negotiationProspects.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                  <Link
                    href={`/coach/pipeline/${p.id}`}
                    className="text-sm font-bold text-foreground hover:underline underline-offset-4"
                  >
                    {p.companyName}
                  </Link>
                  {p.expectedValueCents && (
                    <span className="ml-auto text-xs text-tbb-navy font-bold tabular-nums">
                      ${(p.expectedValueCents / 100).toLocaleString("en-CA")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      ),
    },
    {
      type: "pipeline_value",
      label: "Pipeline value",
      defaultSize: "small",
      node: (
        <CardShell
          icon={<TrendingUp className="w-4 h-4" aria-hidden />}
          title="Pipeline value"
          href="/coach/pipeline"
          cta="Open"
        >
          <p className="font-bold text-foreground text-2xl tracking-tight">
            ${(pipelineValue / 100).toLocaleString("en-CA", { maximumFractionDigits: 0 })}
            <span className="text-xs text-muted-foreground"> CAD</span>
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
            across {activeProspects.length} active prospect
            {activeProspects.length === 1 ? "" : "s"}
          </p>
        </CardShell>
      ),
    },
    {
      type: "upcoming_sessions",
      label: "Upcoming sessions",
      defaultSize: "medium",
      node: (
        <CardShell
          icon={<Calendar className="w-4 h-4" aria-hidden />}
          title="Upcoming sessions"
          href="/coach"
          cta="Open"
        >
          {upcomingSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nothing scheduled.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {upcomingSessions.slice(0, 5).map((s) => (
                <li
                  key={s.id}
                  className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                >
                  <Link
                    href={`/coach/sessions/${s.engagementId}/${s.id}`}
                    className="text-sm font-bold text-foreground hover:underline underline-offset-4"
                  >
                    {formatSessionTime(s.scheduledAt)}
                  </Link>
                  <span className="text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {s.engagementName ?? s.type}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      ),
    },
    {
      type: "projects",
      label: "Active projects",
      defaultSize: "medium",
      node: (
        <CardShell
          icon={<Briefcase className="w-4 h-4" aria-hidden />}
          title={`Projects · ${activeProjects.length}`}
          href="/coach/projects"
          cta="All projects"
        >
          {activeProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No active projects.
            </p>
          ) : (
            <ul className="space-y-1">
              {activeProjects.slice(0, 5).map((p) => (
                <li
                  key={p.id}
                  className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                >
                  <span className="text-sm font-bold text-foreground">{p.name}</span>
                  <span className="text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {p.engagementName}
                  </span>
                  <span className="ml-auto text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      ),
    },
    {
      type: "hiring",
      label: "Hiring pipeline",
      defaultSize: "small",
      node: (
        <CardShell
          icon={<UserCheck className="w-4 h-4" aria-hidden />}
          title={`Hiring · ${activeHires.length}`}
          href="/coach/hiring"
          cta="Open"
        >
          {activeHires.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No candidates in flight.
            </p>
          ) : (
            <ul className="space-y-1">
              {activeHires.slice(0, 5).map((h) => (
                <li
                  key={h.id}
                  className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                >
                  <span className="text-sm font-bold text-foreground">
                    {h.candidateName}
                  </span>
                  <span className="text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {h.engagementName}
                  </span>
                  <span className="ml-auto text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {h.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      ),
    },
    {
      type: "deliverables",
      label: "Deliverables in flight",
      defaultSize: "small",
      node: (
        <CardShell
          icon={<FileText className="w-4 h-4" aria-hidden />}
          title={`Deliverables · ${inflightDeliverables.length}`}
          href="/coach/deliverables"
          cta="Open"
        >
          {inflightDeliverables.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nothing in flight.
            </p>
          ) : (
            <ul className="space-y-1">
              {inflightDeliverables.slice(0, 5).map((d) => (
                <li
                  key={d.id}
                  className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                >
                  <span className="text-sm font-bold text-foreground">{d.title}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {d.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      ),
    },
    {
      type: "goals_overdue",
      label: "Goals past target",
      defaultSize: "small",
      node: (
        <CardShell
          icon={<Target className="w-4 h-4" aria-hidden />}
          title={`Goals · ${overdueGoals.length} past target`}
          href="/coach/goals"
          cta="Open"
        >
          {overdueGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Goals on track.
            </p>
          ) : (
            <ul className="space-y-1">
              {overdueGoals.slice(0, 5).map((g) => (
                <li
                  key={g.id}
                  className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                >
                  <span className="text-sm font-bold text-foreground">{g.title}</span>
                  <span className="text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {g.engagementName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      ),
    },
    {
      type: "subscriptions",
      label: "Subscription run rate",
      defaultSize: "small",
      node: (
        <CardShell
          icon={<CreditCard className="w-4 h-4" aria-hidden />}
          title="Subscriptions"
          href="/coach/subscriptions"
          cta="Open"
        >
          <p className="font-bold text-foreground text-2xl tracking-tight">
            ${(subsRunRate / 100).toFixed(2)}
            <span className="text-xs text-muted-foreground"> / mo</span>
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
            {subscriptions.length} services across {engagements.length} engagement
            {engagements.length === 1 ? "" : "s"}
          </p>
        </CardShell>
      ),
    },
    {
      type: "engagements",
      label: "Engagements",
      defaultSize: "medium",
      node: (
        <CardShell
          icon={<Users className="w-4 h-4" aria-hidden />}
          title="Engagements"
          href="/coach/engagements/new"
          cta="+ New"
        >
          {engagements.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No engagements yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {engagements.slice(0, 5).map((e) => (
                <li
                  key={e.id}
                  className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
                >
                  <span className="text-sm font-bold text-foreground">
                    {e.name ?? "Engagement"}
                  </span>
                  <span className="text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {e.type} · {e.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      ),
    },
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-10 sm:py-12 space-y-8">
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-tbb-caps text-muted-foreground">
              Business Builder Console
            </p>
            <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
              Hey {profile.fullName.split(" ")[0] ?? profile.fullName}.
            </h1>
            <p className="text-sm text-muted-foreground">
              {engagements.length} engagement{engagements.length === 1 ? "" : "s"} active.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/coach/engagements/new"
              className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
            >
              <Plus className="w-4 h-4" aria-hidden /> New engagement
            </Link>
            <Link
              href="/portal?preview=1"
              title="Preview what a client sees when they log in"
              className="text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Client Portal View
            </Link>
          </div>
        </header>

        <HomeDashboard
          availableCards={cards}
          initialLayout={prefs.homeDashboardLayout}
        />
      </div>
    </main>
  );
}

function CardShell({
  icon,
  title,
  href,
  cta,
  children,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  cta: string;
  children: React.ReactNode;
  accent?: "orange";
}) {
  return (
    <section className="p-5 space-y-3 h-full">
      <header className="flex items-baseline justify-between gap-3">
        <div
          className={
            "flex items-center gap-2 " +
            (accent === "orange" ? "text-tbb-warning" : "text-muted-foreground")
          }
        >
          {icon}
          <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps">
            {title}
          </h2>
        </div>
        <Link
          href={href}
          className="text-[10px] font-bold uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          {cta} →
        </Link>
      </header>
      {children}
    </section>
  );
}
