/**
 * /portal/calendar — client-facing calendar for the current engagement.
 *
 * Mirrors the business-builder calendar but scoped to ONE engagement
 * (the viewer's home engagement or the one selected via the slug
 * cookie). Three event types:
 *
 *   1. Coaching sessions (bbs_sessions.scheduled_at)
 *   2. Action item deadlines (action_items.due_date)
 *   3. Project target dates (projects.target_date)
 *
 * Filter chips toggle types. No client picker — only one client
 * (theirs). Optional "mine only" filter for action items so a
 * client_employee can hide everyone else's commitments.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  and,
  asc,
  eq,
  gte,
  isNotNull,
  lte,
} from "drizzle-orm";
import {
  Briefcase,
  Calendar as CalendarIcon,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Flag,
  Sparkles,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import {
  actionItems,
  bbsSessions,
  engagements,
  projects,
} from "@/lib/db/schema";
import { withEngagementContext } from "@/lib/db/tenant";

type ViewMode = "week" | "month";
type EventType = "session" | "action" | "project";

type CalendarEvent = {
  id: string;
  type: EventType;
  date: Date;
  title: string;
  status: string;
  href: string;
  mine: boolean;
};

function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}
function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}
function startOfWeek(d: Date): Date {
  const n = startOfDay(d);
  const day = n.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(n, diff);
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function parseTypes(raw: string | undefined): Set<EventType> {
  const defaults: EventType[] = ["session", "action", "project"];
  if (!raw) return new Set<EventType>(defaults);
  const parts = raw.split(",").filter(Boolean) as EventType[];
  const valid = parts.filter(
    (p) => p === "session" || p === "action" || p === "project",
  );
  return valid.length > 0
    ? new Set<EventType>(valid)
    : new Set<EventType>(defaults);
}

export default async function PortalCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    date?: string;
    types?: string;
    scope?: string;
  }>;
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();
  if (!engagement) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-bold text-tbb-navy text-3xl tracking-tight">
          No engagement yet
        </h1>
        <p className="mt-4 text-sm text-tbb-ink-3">
          Your portal isn&apos;t bound to an engagement yet. If you expect
          access, contact your Business Builder.
        </p>
      </main>
    );
  }

  const sp = await searchParams;
  const view: ViewMode = sp.view === "month" ? "month" : "week";
  const anchorDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
    ? new Date(sp.date + "T12:00:00")
    : new Date();
  const typeFilter = parseTypes(sp.types);
  const mineOnly = sp.scope === "mine";

  const rangeStart =
    view === "month" ? startOfMonth(anchorDate) : startOfWeek(anchorDate);
  const rangeEnd =
    view === "month" ? endOfMonth(anchorDate) : addDays(rangeStart, 7);

  // All three reads use withEngagementContext to honour the coach
  // cross-org case (a coach viewing a client engagement). Client roles
  // are auto-gated to their own org by the same helper.
  const [sessionRows, actionRows, projectRows] = await Promise.all([
    typeFilter.has("session")
      ? withEngagementContext(
          profile.orgId,
          profile.role,
          engagement.id,
          async (tx) =>
            tx
              .select({
                id: bbsSessions.id,
                scheduledAt: bbsSessions.scheduledAt,
                type: bbsSessions.type,
                status: bbsSessions.status,
                engagementName: engagements.name,
              })
              .from(bbsSessions)
              .leftJoin(
                engagements,
                eq(engagements.id, bbsSessions.engagementId),
              )
              .where(
                and(
                  eq(bbsSessions.engagementId, engagement.id),
                  gte(bbsSessions.scheduledAt, rangeStart),
                  lte(bbsSessions.scheduledAt, rangeEnd),
                ),
              )
              .orderBy(asc(bbsSessions.scheduledAt)),
        )
      : Promise.resolve([]),
    typeFilter.has("action")
      ? withEngagementContext(
          profile.orgId,
          profile.role,
          engagement.id,
          async (tx) =>
            tx
              .select({
                id: actionItems.id,
                title: actionItems.title,
                dueDate: actionItems.dueDate,
                status: actionItems.status,
                assigneeUserProfileId: actionItems.assigneeUserProfileId,
              })
              .from(actionItems)
              .where(
                and(
                  eq(actionItems.engagementId, engagement.id),
                  isNotNull(actionItems.dueDate),
                  gte(actionItems.dueDate, rangeStart),
                  lte(actionItems.dueDate, rangeEnd),
                ),
              )
              .orderBy(asc(actionItems.dueDate)),
        )
      : Promise.resolve([]),
    typeFilter.has("project")
      ? withEngagementContext(
          profile.orgId,
          profile.role,
          engagement.id,
          async (tx) =>
            tx
              .select({
                id: projects.id,
                name: projects.name,
                targetDate: projects.targetDate,
                status: projects.status,
              })
              .from(projects)
              .where(
                and(
                  eq(projects.engagementId, engagement.id),
                  isNotNull(projects.targetDate),
                  gte(projects.targetDate, rangeStart),
                  lte(projects.targetDate, rangeEnd),
                ),
              )
              .orderBy(asc(projects.targetDate)),
        )
      : Promise.resolve([]),
  ]);

  // Merge into a unified event list.
  const events: CalendarEvent[] = [
    ...sessionRows.map((s) => ({
      id: `s-${s.id}`,
      type: "session" as const,
      date: s.scheduledAt,
      title: s.engagementName ?? "Session",
      status: s.status,
      href: `/portal/sessions/${s.id}`,
      mine: true,
    })),
    ...actionRows
      .filter((a) =>
        mineOnly ? a.assigneeUserProfileId === profile.userProfileId : true,
      )
      .map((a) => ({
        id: `a-${a.id}`,
        type: "action" as const,
        date: a.dueDate!,
        title: a.title,
        status: a.status,
        href: `/portal/action-items/${a.id}`,
        mine: a.assigneeUserProfileId === profile.userProfileId,
      })),
    ...projectRows.map((p) => ({
      id: `p-${p.id}`,
      type: "project" as const,
      date: p.targetDate!,
      title: p.name,
      status: p.status,
      href: `/portal/projects/${p.id}`,
      mine: true,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Bucket events by day.
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = e.date.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(e);
  }

  // Nav dates.
  const prevAnchor =
    view === "month"
      ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1)
      : addDays(rangeStart, -7);
  const nextAnchor =
    view === "month"
      ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1)
      : addDays(rangeStart, 7);

  const fmtIso = (d: Date) => d.toISOString().slice(0, 10);
  function buildHref(opts: {
    view?: ViewMode;
    date?: Date;
    types?: string;
    scope?: string;
  }): string {
    const params = new URLSearchParams();
    params.set("view", opts.view ?? view);
    params.set("date", fmtIso(opts.date ?? anchorDate));
    if (opts.types !== undefined) {
      if (opts.types) params.set("types", opts.types);
    } else if (sp.types) {
      params.set("types", sp.types);
    }
    if (opts.scope !== undefined) {
      if (opts.scope) params.set("scope", opts.scope);
    } else if (mineOnly) {
      params.set("scope", "mine");
    }
    return `/portal/calendar?${params.toString()}`;
  }

  const rangeLabel =
    view === "month"
      ? anchorDate.toLocaleString("en-CA", {
          month: "long",
          year: "numeric",
        })
      : `${rangeStart.toLocaleString("en-CA", {
          month: "short",
          day: "numeric",
        })} – ${addDays(rangeStart, 6).toLocaleString("en-CA", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`;

  // Cells for the grid.
  const cells: { date: Date; inRange: boolean }[] = [];
  if (view === "week") {
    for (let i = 0; i < 7; i++) {
      cells.push({ date: addDays(rangeStart, i), inRange: true });
    }
  } else {
    const firstCell = startOfWeek(rangeStart);
    for (let i = 0; i < 42; i++) {
      const d = addDays(firstCell, i);
      cells.push({
        date: d,
        inRange:
          d.getMonth() === anchorDate.getMonth() &&
          d.getFullYear() === anchorDate.getFullYear(),
      });
    }
  }
  const today = startOfDay(new Date()).getTime();

  function urlWithToggledType(t: EventType): string {
    const next = new Set(typeFilter);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    if (next.size === 0) next.add(t);
    return buildHref({ types: Array.from(next).join(",") });
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-tbb-ink-3">
            {engagement.name ?? "Engagement"}
          </p>
          <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight flex items-center gap-2">
            <CalendarIcon className="w-7 h-7" aria-hidden /> Calendar
          </h1>
          <p className="text-sm text-tbb-ink-3 max-w-2xl">
            Your sessions, action item due dates, and project deadlines
            on one screen. Toggle a chip to focus.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={buildHref({ date: prevAnchor })}
            aria-label="Previous"
            className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-tbb-line bg-white text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden />
          </Link>
          <Link
            href={buildHref({ date: new Date() })}
            className="text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-md border border-tbb-line bg-white text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue"
          >
            Today
          </Link>
          <Link
            href={buildHref({ date: nextAnchor })}
            aria-label="Next"
            className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-tbb-line bg-white text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue"
          >
            <ChevronRight className="w-4 h-4" aria-hidden />
          </Link>
          <span className="mx-3 text-sm text-tbb-ink-2 font-bold">
            {rangeLabel}
          </span>
          <div className="inline-flex bg-white border border-tbb-line rounded-pill p-0.5">
            <Link
              href={buildHref({ view: "week" })}
              className={
                "px-3 py-1 rounded-pill text-xs font-bold uppercase tracking-tbb-caps " +
                (view === "week"
                  ? "bg-tbb-navy text-white"
                  : "text-tbb-navy hover:bg-tbb-cream-50")
              }
            >
              Week
            </Link>
            <Link
              href={buildHref({ view: "month" })}
              className={
                "px-3 py-1 rounded-pill text-xs font-bold uppercase tracking-tbb-caps " +
                (view === "month"
                  ? "bg-tbb-navy text-white"
                  : "text-tbb-navy hover:bg-tbb-cream-50")
              }
            >
              Month
            </Link>
          </div>
        </div>
      </header>

      {/* Filter chips */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Show:
        </span>
        <Link
          href={urlWithToggledType("session")}
          className={chipClass(typeFilter.has("session"), "session")}
        >
          <CalendarIcon className="w-3 h-3" aria-hidden /> Sessions
        </Link>
        <Link
          href={urlWithToggledType("action")}
          className={chipClass(typeFilter.has("action"), "action")}
        >
          <CheckSquare className="w-3 h-3" aria-hidden /> Action items
        </Link>
        <Link
          href={urlWithToggledType("project")}
          className={chipClass(typeFilter.has("project"), "project")}
        >
          <Briefcase className="w-3 h-3" aria-hidden /> Project deadlines
        </Link>
        <Link
          href={buildHref({ scope: mineOnly ? "" : "mine" })}
          className={
            "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border ml-2 " +
            (mineOnly
              ? "bg-tbb-orange text-white border-tbb-orange"
              : "bg-white text-tbb-ink-3 border-tbb-line hover:border-tbb-orange")
          }
        >
          {mineOnly ? "Mine only" : "Everyone"}
        </Link>
      </div>

      <div className="border border-tbb-line rounded-lg bg-white overflow-hidden shadow-tbb-sm">
        <div className="grid grid-cols-7 border-b border-tbb-line-soft bg-tbb-bg-soft">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div
              key={d}
              className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 text-center py-2"
            >
              {d}
            </div>
          ))}
        </div>
        <div
          className={
            "grid grid-cols-7 " +
            (view === "week" ? "min-h-[400px]" : "min-h-[600px]")
          }
        >
          {cells.map((c, i) => {
            const key = fmtIso(c.date);
            const dayEvents = byDay.get(key) ?? [];
            const isToday = startOfDay(c.date).getTime() === today;
            return (
              <div
                key={i}
                className={
                  "border-b border-r border-tbb-line-soft p-2 min-h-[110px] " +
                  (c.inRange ? "bg-white" : "bg-tbb-cream-50/40")
                }
              >
                <div className="flex items-baseline justify-between mb-1.5">
                  <span
                    className={
                      "text-xs font-bold " +
                      (isToday
                        ? "bg-tbb-blue text-white px-1.5 py-0.5 rounded-pill"
                        : c.inRange
                          ? "text-tbb-navy"
                          : "text-tbb-ink-3/50")
                    }
                  >
                    {c.date.getDate()}
                  </span>
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-tbb-ink-3">
                      {dayEvents.length}
                    </span>
                  )}
                </div>
                <ul className="space-y-1">
                  {dayEvents.slice(0, 3).map((e) => (
                    <li key={e.id}>
                      <EventChip event={e} />
                    </li>
                  ))}
                  {dayEvents.length > 3 && (
                    <li className="text-[10px] text-tbb-ink-3 italic">
                      +{dayEvents.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* List view */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-tbb-caps text-tbb-ink-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-tbb-blue" aria-hidden />
          {events.length} event{events.length === 1 ? "" : "s"} in this {view}
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-tbb-ink-3 italic">
            Nothing in this {view} matching your filters. Switch view or
            toggle a filter chip on.
          </p>
        ) : (
          <ul className="border border-tbb-line rounded-lg bg-white divide-y divide-tbb-line-soft overflow-hidden shadow-tbb-sm">
            {events.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <Link
                  href={e.href}
                  className="flex items-baseline justify-between gap-3 flex-wrap hover:text-tbb-blue"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue tabular-nums w-32 shrink-0">
                      {e.date.toLocaleString("en-CA", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <TypePill type={e.type} />
                    <span className="font-bold text-tbb-navy">{e.title}</span>
                    {e.type === "action" && e.mine && (
                      <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-orange">
                        Yours
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 bg-tbb-cream-50 px-1.5 py-0.5 rounded-pill">
                    {e.status.replace(/_/g, " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function chipClass(active: boolean, type: EventType): string {
  const base =
    "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border transition-colors ";
  if (!active) {
    return base + "bg-white text-tbb-ink-3 border-tbb-line hover:border-tbb-blue";
  }
  if (type === "session")
    return base + "bg-tbb-blue text-white border-tbb-blue";
  if (type === "action")
    return base + "bg-tbb-orange text-white border-tbb-orange";
  return base + "bg-tbb-navy text-white border-tbb-navy";
}

function EventChip({ event }: { event: CalendarEvent }) {
  const isSession = event.type === "session";
  const isAction = event.type === "action";
  return (
    <Link
      href={event.href}
      className={
        "block px-1.5 py-1 rounded text-[10px] leading-snug border-l-2 hover:opacity-80 " +
        (isSession
          ? "bg-tbb-blue-50 border-tbb-blue text-tbb-navy"
          : isAction
            ? "bg-tbb-cream-50 border-tbb-orange text-tbb-navy"
            : "bg-tbb-navy/10 border-tbb-navy text-tbb-navy")
      }
      title={event.title}
    >
      <span className="font-bold tabular-nums">
        {isSession
          ? event.date.toLocaleTimeString("en-CA", {
              hour: "numeric",
              minute: "2-digit",
            })
          : isAction
            ? "Due"
            : "Target"}
      </span>
      <span className="block truncate">{event.title}</span>
    </Link>
  );
}

function TypePill({ type }: { type: EventType }) {
  const meta =
    type === "session"
      ? { label: "Session", cls: "bg-tbb-blue text-white", Icon: CalendarIcon }
      : type === "action"
        ? { label: "Action", cls: "bg-tbb-orange text-white", Icon: CheckSquare }
        : { label: "Project", cls: "bg-tbb-navy text-white", Icon: Flag };
  const I = meta.Icon;
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-tbb-caps px-1.5 py-0.5 rounded-pill " +
        meta.cls
      }
    >
      <I className="w-2.5 h-2.5" aria-hidden />
      {meta.label}
    </span>
  );
}
