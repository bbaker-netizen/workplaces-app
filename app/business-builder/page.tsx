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
} from "@/lib/db/queries/business-builder-cross-engagement";
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

  /**
   * Unified Commitments stream — action items, deliverables, and goals
   * collapsed into one ranked list. Bruce's complaint: "action items
   * feel the same as deliverables, goals feel redundant." Methodology
   * keeps them distinct (small commitments vs. named artifacts vs.
   * SMART destinations) but operationally he just wants to see what's
   * on the plate. This card gives him that view; the dedicated module
   * pages still exist for when he wants to slice.
   */
  type CommitmentRow = {
    id: string;
    kind: "Action item" | "Deliverable" | "Goal";
    title: string;
    href: string;
    engagementName: string | null;
    dueDate: Date | null;
    status: string;
  };
  const commitments: CommitmentRow[] = [
    ...actionItems
      .filter((i) => i.status !== "done" && i.status !== "draft")
      .map(
        (i): CommitmentRow => ({
          id: `ai-${i.id}`,
          kind: "Action item",
          title: i.title,
          href: `/business-builder/action-items/${i.id}`,
          engagementName: i.engagementName ?? null,
          dueDate: i.dueDate ?? null,
          status: i.status,
        }),
      ),
    ...inflightDeliverables.map(
      (d): CommitmentRow => ({
        id: `dv-${d.id}`,
        kind: "Deliverable",
        title: d.title,
        href: `/business-builder/deliverables`,
        engagementName: d.engagementName ?? null,
        // Deliverables don't carry a due date today — they're paced by
        // session cadence. Null sorts to the bottom of the list which
        // is fine.
        dueDate: null,
        status: d.status,
      }),
    ),
    ...goals
      .filter((g) => g.status !== "achieved" && g.status !== "abandoned")
      .map(
        (g): CommitmentRow => ({
          id: `gl-${g.id}`,
          kind: "Goal",
          title: g.title,
          href: `/portal/goals/${g.id}`,
          engagementName: g.engagementName ?? null,
          dueDate: g.targetDate ?? null,
          status: g.status,
        }),
      ),
  ].sort((a, b) => {
    const ao = a.dueDate && a.dueDate < now ? 0 : 1;
    const bo = b.dueDate && b.dueDate < now ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const at = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
    return at - bt;
  });
  const commitmentsTop = commitments.slice(0, 10);

  const cards: DashboardCard[] = [
    {
      type: "my_work",
      label: "My work",
      defaultSize: "large",
      node: (
        <CardShell
          icon={<CheckSquare className="w-4 h-4" aria-hidden />}
          title="My work"
          href="/business-builder/action-items"
          cta="Open"
        >
          {myWork.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              {pickEmptyMyWork()}
            </p>
          ) : (
            <ul className="space-y-1">
              {myWork.map((it) => {
                const overdue =
                  it.dueDate && it.dueDate < now && it.status !== "done";
                return (
                  <li key={it.id}>
                    <Link
                      href={`/business-builder/action-items/${it.id}`}
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
      type: "commitments",
      label: "Commitments — all clients",
      defaultSize: "large",
      node: (
        <CardShell
          icon={<CheckSquare className="w-4 h-4" aria-hidden />}
          title="Commitments — across every client"
          href="/business-builder/action-items"
          cta="Open action items"
        >
          {commitmentsTop.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nothing on the plate across action items, deliverables, or
              goals. Suspicious. Or impressive.
            </p>
          ) : (
            <ul className="space-y-1">
              {commitmentsTop.map((c) => {
                const overdue = c.dueDate && c.dueDate < now;
                return (
                  <li key={c.id}>
                    <Link
                      href={c.href}
                      className={
                        "block py-1.5 pl-3 border-l-2 group hover:bg-tbb-cream-50 transition-colors " +
                        (overdue ? "border-tbb-danger" : "border-transparent")
                      }
                    >
                      <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                        <span
                          className={
                            "text-[9px] font-mono uppercase tracking-tbb-caps px-1.5 py-0.5 rounded " +
                            (c.kind === "Action item"
                              ? "bg-tbb-blue/10 text-tbb-blue border border-tbb-blue/40"
                              : c.kind === "Deliverable"
                                ? "bg-amber-50 text-amber-700 border border-amber-300"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-300")
                          }
                        >
                          {c.kind}
                        </span>
                        <span className="text-sm font-bold text-foreground group-hover:underline underline-offset-4">
                          {c.title}
                        </span>
                        {c.engagementName && (
                          <span className="text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                            {c.engagementName}
                          </span>
                        )}
                        {c.dueDate && (
                          <span
                            className={
                              "ml-auto text-[10px] uppercase tracking-tbb-caps " +
                              (overdue
                                ? "text-tbb-danger font-bold"
                                : "text-muted-foreground")
                            }
                          >
                            {overdue ? "Overdue · " : "Due "}
                            {c.dueDate.toLocaleDateString(undefined, {
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
          href="/business-builder/pipeline"
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
                    href={`/business-builder/pipeline/${p.id}`}
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
          href="/business-builder/pipeline"
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
                    href={`/business-builder/pipeline/${p.id}`}
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
          href="/business-builder/pipeline"
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
          href="/business-builder"
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
                    href={`/business-builder/sessions/${s.engagementId}/${s.id}`}
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
          href="/business-builder/projects"
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
          href="/business-builder/hiring"
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
          href="/business-builder/deliverables"
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
          href="/business-builder/goals"
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
          href="/business-builder/subscriptions"
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
          href="/business-builder/engagements/new"
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

  // Time-of-day greeting + a small encouraging line based on the day's
  // shape. Keeps the dashboard from feeling like a clinical readout.
  const hour = new Date().getHours();
  const timeBucket =
    hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const greetingEmoji =
    timeBucket === "morning" ? "☀️" : timeBucket === "afternoon" ? "👋" : "🌙";
  const firstName = profile.fullName.split(" ")[0] ?? profile.fullName;
  const encouragements = buildEncouragements({
    newLeadsCount: newLeads.length,
    overdueCount: myWork.filter(
      (i) => i.dueDate && i.dueDate < now,
    ).length,
    upcomingSessionsCount: upcomingSessions.length,
    negotiationCount: negotiationProspects.length,
  });

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-10 sm:py-12 space-y-8">
        <header className="app-rise flex items-end justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-tbb-caps text-muted-foreground">
              Business Builder Console
            </p>
            <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
              Good {timeBucket}, {firstName}.{" "}
              <span className="inline-block animate-[wave_2s_ease-in-out_1]" aria-hidden>
                {greetingEmoji}
              </span>
            </h1>
            <p className="text-sm text-muted-foreground">{encouragements}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/business-builder/engagements/new"
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

/**
 * One-line vibe check based on what's on the plate. Tries hard NOT to
 * sound like a dashboard. Picks one of a few lines per state so the
 * page never reads the same way two visits in a row.
 *
 * Day-of-week + time-of-day matter — Monday morning sounds different
 * from Friday evening. The deck-shuffling is light: a small pool per
 * state, rotated by date so it's stable through the day but changes.
 */
/** Empty-state line for the My Work card. Picks fresh daily so the
 *  joke doesn't get stale. */
function pickEmptyMyWork(): string {
  const now = new Date();
  const dayKey = now.getFullYear() * 366 + now.getMonth() * 31 + now.getDate();
  const lines = [
    "Nothing on your plate. Maybe go for a walk.",
    "Inbox zero of the action item world. Earned it.",
    "Plate's empty. Suspiciously empty. Did you ship something?",
    "All clear. Now pick the long thing you've been avoiding.",
    "No assigned items. Either you're crushing it, or someone's about to.",
  ];
  return lines[dayKey % lines.length];
}

function buildEncouragements(input: {
  newLeadsCount: number;
  overdueCount: number;
  upcomingSessionsCount: number;
  negotiationCount: number;
}): string {
  const now = new Date();
  const dow = now.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
  const hour = now.getHours();
  // Deterministic rotation index so the line is stable for the day but
  // different tomorrow.
  const dayKey = now.getFullYear() * 366 + now.getMonth() * 31 + now.getDate();
  const pick = <T,>(arr: T[]) => arr[dayKey % arr.length];

  // Day/time tone overrides — these stomp the data-driven picks for moments
  // where the calendar matters more than the queue.
  if (dow === 6) {
    return pick([
      "Saturday. You shouldn't be here. Go outside.",
      "Saturday. The pipeline survives without you for 48 hours. Promise.",
      "Saturday. Builders rest too.",
    ]);
  }
  if (dow === 0) {
    return pick([
      "Sunday. Plan the week, then close the laptop.",
      "Sunday — light planning, heavy coffee.",
    ]);
  }
  if (dow === 5 && hour >= 15) {
    return pick([
      "Friday afternoon. The pipeline can wait an hour.",
      "Friday — wrap one thing, leave the rest for Monday.",
      "Friday afternoon. Earn the weekend.",
    ]);
  }
  if (dow === 1 && hour < 10) {
    return pick([
      "Monday. Let's go.",
      "Monday morning — the week's a blank page. Make it count.",
      "Fresh week. Big things compound from small Mondays.",
    ]);
  }

  if (input.overdueCount > 0) {
    return pick([
      `${input.overdueCount} item${input.overdueCount === 1 ? "" : "s"} overdue. Let's chip 'em down.`,
      `${input.overdueCount} thing${input.overdueCount === 1 ? "" : "s"} past due. Five-minute rule: knock one out.`,
      `${input.overdueCount} overdue. Future-Bruce will thank you for clearing them.`,
    ]);
  }
  if (input.newLeadsCount > 0) {
    return pick([
      `${input.newLeadsCount} fresh lead${input.newLeadsCount === 1 ? "" : "s"}. Coffee, then call.`,
      `${input.newLeadsCount} new lead${input.newLeadsCount === 1 ? "" : "s"} hit overnight. First 5 minutes are worth 9 hours later.`,
      `${input.newLeadsCount} new lead${input.newLeadsCount === 1 ? "" : "s"} waiting on hello. Strike while warm.`,
    ]);
  }
  if (input.negotiationCount > 0) {
    return pick([
      `${input.negotiationCount} prospect${input.negotiationCount === 1 ? "" : "s"} in negotiation. Close week?`,
      `${input.negotiationCount} in the red zone. Don't fumble.`,
      `${input.negotiationCount} negotiating. Listen for the real objection.`,
    ]);
  }
  if (input.upcomingSessionsCount > 0) {
    return pick([
      `${input.upcomingSessionsCount} session${input.upcomingSessionsCount === 1 ? "" : "s"} on deck. Great rhythm.`,
      `${input.upcomingSessionsCount} session${input.upcomingSessionsCount === 1 ? "" : "s"} coming. Show up prepared, leave them better.`,
    ]);
  }
  return pick([
    "Plate's clear. Rare bird, that. 🦅",
    "Empty queue. Think, plan, or go hunt.",
    "Clean dashboard, clear head. Build something.",
    "All caught up. The dangerous moment — pick a long thing and start.",
  ]);
}
