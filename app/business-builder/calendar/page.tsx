/**
 * /business-builder/calendar — every dated item across every client
 * engagement on one screen.
 *
 * Three event types now:
 *   1. Coaching sessions (bbs_sessions.scheduled_at)
 *   2. Action item deadlines (action_items.due_date)
 *   3. Project target dates (projects.target_date) — rendered as a
 *      single-day milestone diamond
 *
 * Filter chips at the top let Bruce toggle each type on/off, and a
 * client (engagement) picker scopes everything to one client. State
 * lives in URL search params so links share cleanly.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
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
import { SyncFromGoogleButton } from "@/components/calendar/SyncFromGoogleButton";
import { GoogleConnectionBanner } from "@/components/calendar/GoogleConnectionBanner";
import {
  actionItems,
  bbsSessions,
  engagements,
  orgs,
  projects,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  getCalendarConnectionHealth,
  listExternalEvents,
} from "@/lib/integrations/google-calendar";
import { SuggestSlotsPanel } from "./SuggestSlotsPanel";

type ViewMode = "week" | "month";
type EventType = "session" | "action" | "project" | "external";

type CalendarEvent = {
  id: string;
  type: EventType;
  date: Date;
  title: string;
  engagementId: string;
  engagementName: string | null;
  status: string;
  href: string;
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
  const defaults: EventType[] = ["session", "action", "project", "external"];
  if (!raw) return new Set<EventType>(defaults);
  const parts = raw.split(",").filter(Boolean) as EventType[];
  const valid = parts.filter(
    (p) =>
      p === "session" ||
      p === "action" ||
      p === "project" ||
      p === "external",
  );
  return valid.length > 0
    ? new Set<EventType>(valid)
    : new Set<EventType>(defaults);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    date?: string;
    types?: string;
    engagement?: string;
  }>;
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const sp = await searchParams;
  const view: ViewMode = sp.view === "month" ? "month" : "week";
  const anchorDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
    ? new Date(sp.date + "T12:00:00")
    : new Date();
  const typeFilter = parseTypes(sp.types);
  const engagementFilter = sp.engagement && sp.engagement !== "all" ? sp.engagement : null;

  const rangeStart =
    view === "month" ? startOfMonth(anchorDate) : startOfWeek(anchorDate);
  const rangeEnd =
    view === "month" ? endOfMonth(anchorDate) : addDays(rangeStart, 7);

  // Load each event source in parallel. Each is scoped to the
  // visible range + (optionally) the engagement filter.
  const engagementClause = engagementFilter
    ? eq(bbsSessions.engagementId, engagementFilter)
    : undefined;
  const actionEngagementClause = engagementFilter
    ? eq(actionItems.engagementId, engagementFilter)
    : undefined;
  const projectEngagementClause = engagementFilter
    ? eq(projects.engagementId, engagementFilter)
    : undefined;

  const [sessionRows, actionRows, projectRows, allEngagements] =
    await Promise.all([
      typeFilter.has("session")
        ? withSystemContext(async (tx) =>
            tx
              .select({
                id: bbsSessions.id,
                scheduledAt: bbsSessions.scheduledAt,
                type: bbsSessions.type,
                status: bbsSessions.status,
                engagementId: bbsSessions.engagementId,
                engagementName: engagements.name,
                orgName: orgs.name,
              })
              .from(bbsSessions)
              .leftJoin(
                engagements,
                eq(engagements.id, bbsSessions.engagementId),
              )
              .leftJoin(orgs, eq(orgs.id, bbsSessions.orgId))
              .where(
                and(
                  gte(bbsSessions.scheduledAt, rangeStart),
                  lte(bbsSessions.scheduledAt, rangeEnd),
                  engagementClause,
                ),
              )
              .orderBy(asc(bbsSessions.scheduledAt)),
          )
        : Promise.resolve([]),
      typeFilter.has("action")
        ? withSystemContext(async (tx) =>
            tx
              .select({
                id: actionItems.id,
                title: actionItems.title,
                dueDate: actionItems.dueDate,
                status: actionItems.status,
                engagementId: actionItems.engagementId,
                engagementName: engagements.name,
              })
              .from(actionItems)
              .leftJoin(
                engagements,
                eq(engagements.id, actionItems.engagementId),
              )
              .where(
                and(
                  isNotNull(actionItems.dueDate),
                  gte(actionItems.dueDate, rangeStart),
                  lte(actionItems.dueDate, rangeEnd),
                  actionEngagementClause,
                ),
              )
              .orderBy(asc(actionItems.dueDate)),
          )
        : Promise.resolve([]),
      typeFilter.has("project")
        ? withSystemContext(async (tx) =>
            tx
              .select({
                id: projects.id,
                name: projects.name,
                targetDate: projects.targetDate,
                status: projects.status,
                engagementId: projects.engagementId,
                engagementName: engagements.name,
              })
              .from(projects)
              .leftJoin(
                engagements,
                eq(engagements.id, projects.engagementId),
              )
              .where(
                and(
                  isNotNull(projects.targetDate),
                  gte(projects.targetDate, rangeStart),
                  lte(projects.targetDate, rangeEnd),
                  projectEngagementClause,
                ),
              )
              .orderBy(asc(projects.targetDate)),
          )
        : Promise.resolve([]),
      withSystemContext(async (tx) =>
        tx
          .select({
            id: engagements.id,
            name: engagements.name,
          })
          .from(engagements)
          .orderBy(asc(engagements.name)),
      ),
    ]);

  // Google Calendar events for the visible range — synced in and shown
  // on the grid automatically (no manual import). Best-effort: if Google
  // isn't connected or the API hiccups, we just skip them.
  let externalEvents: CalendarEvent[] = [];
  if (typeFilter.has("external")) {
    try {
      const external = await listExternalEvents(
        profile.userProfileId,
        rangeStart,
        rangeEnd,
      );
      externalEvents = external.map((e) => ({
        id: `g-${e.id}`,
        type: "external" as const,
        date: e.start,
        title: e.summary,
        engagementId: "",
        engagementName: null,
        status: "confirmed",
        href: e.htmlLink ?? "#",
      }));
    } catch {
      // Google not connected / transient API error — skip.
    }
  }

  // Merge into a unified event list.
  const events: CalendarEvent[] = [
    ...sessionRows.map((s) => ({
      id: `s-${s.id}`,
      type: "session" as const,
      date: s.scheduledAt,
      title: s.engagementName ?? s.orgName ?? "Session",
      engagementId: s.engagementId,
      engagementName: s.engagementName,
      status: s.status,
      href: `/business-builder/sessions/${s.engagementId}`,
    })),
    ...actionRows.map((a) => ({
      id: `a-${a.id}`,
      type: "action" as const,
      date: a.dueDate!,
      title: a.title,
      engagementId: a.engagementId,
      engagementName: a.engagementName,
      status: a.status,
      href: `/business-builder/action-items/${a.id}`,
    })),
    ...projectRows.map((p) => ({
      id: `p-${p.id}`,
      type: "project" as const,
      date: p.targetDate!,
      title: p.name,
      engagementId: p.engagementId,
      engagementName: p.engagementName,
      status: p.status,
      href: `/portal/projects/${p.id}`,
    })),
    ...externalEvents,
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Bucket events by their Mountain-Time calendar day. The server clock is
  // UTC, so bucketing on the raw ISO date pushed evening MT sessions onto
  // the next day — and the displayed times read in UTC (e.g. a 5pm MT
  // session showing as 11pm). en-CA gives a YYYY-MM-DD that lines up with
  // the grid's cell keys. (Same fix already applied on /portal/calendar.)
  const mtDayKey = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = mtDayKey(e.date);
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
  // Build a URL keeping all current filters intact.
  function buildHref(opts: {
    view?: ViewMode;
    date?: Date;
    types?: string;
    engagement?: string;
  }): string {
    const params = new URLSearchParams();
    params.set("view", opts.view ?? view);
    params.set("date", fmtIso(opts.date ?? anchorDate));
    if (opts.types !== undefined) {
      if (opts.types) params.set("types", opts.types);
    } else if (sp.types) {
      params.set("types", sp.types);
    }
    if (opts.engagement !== undefined) {
      if (opts.engagement && opts.engagement !== "all")
        params.set("engagement", opts.engagement);
    } else if (engagementFilter) {
      params.set("engagement", engagementFilter);
    }
    return `/business-builder/calendar?${params.toString()}`;
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

  // Helper to toggle a type in the current filter and produce a new URL.
  function urlWithToggledType(t: EventType): string {
    const next = new Set(typeFilter);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    if (next.size === 0) next.add(t); // never zero — empty calendar is useless
    return buildHref({ types: Array.from(next).join(",") });
  }
  void inArray;

  // Live connection health — a dead Google token surfaces here instead of
  // silently producing zero synced sessions.
  const calendarHealth = await getCalendarConnectionHealth(
    profile.userProfileId,
  );

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-6">
      <GoogleConnectionBanner health={calendarHealth} />
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="tbb-eyebrow">Schedule</p>
          <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight flex items-center gap-2">
            <CalendarIcon className="w-7 h-7" aria-hidden /> Calendar
          </h1>
          <p className="text-sm text-tbb-ink-3 max-w-2xl">
            Coaching sessions, action item deadlines, and project target
            dates across every client — one screen. Toggle types or
            scope to a single client to focus.
          </p>
          <SyncFromGoogleButton />
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

      {/* Filters: event type chips + client picker */}
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
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Client:
          </span>
          <ClientFilter
            engagements={allEngagements.map((e) => ({
              id: e.id,
              name: e.name ?? "(unnamed)",
            }))}
            currentEngagementId={engagementFilter}
            view={view}
            anchorDate={fmtIso(anchorDate)}
            types={sp.types}
          />
        </span>
      </div>

      <SuggestSlotsPanel />

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
                        timeZone: "America/Edmonton",
                      })}
                    </span>
                    <TypePill type={e.type} />
                    <span className="font-bold text-tbb-navy">{e.title}</span>
                    {e.engagementName && (
                      <span className="text-xs text-tbb-ink-3">
                        · {e.engagementName}
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
  if (type === "external")
    return base + "bg-emerald-600 text-white border-emerald-600";
  return base + "bg-tbb-navy text-white border-tbb-navy";
}

function EventChip({ event }: { event: CalendarEvent }) {
  const isSession = event.type === "session";
  const isAction = event.type === "action";
  const isExternal = event.type === "external";
  const timed = isSession || isExternal;
  return (
    <Link
      href={event.href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className={
        "block px-1.5 py-1 rounded text-[10px] leading-snug border-l-2 hover:opacity-80 " +
        (isSession
          ? "bg-tbb-blue-50 border-tbb-blue text-tbb-navy"
          : isAction
            ? "bg-tbb-cream-50 border-tbb-orange text-tbb-navy"
            : isExternal
              ? "bg-emerald-50 border-emerald-500 text-emerald-900"
              : "bg-tbb-navy/10 border-tbb-navy text-tbb-navy")
      }
      title={`${event.title}${event.engagementName ? " — " + event.engagementName : ""}`}
    >
      <span className="font-bold tabular-nums">
        {timed
          ? event.date.toLocaleTimeString("en-CA", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: "America/Edmonton",
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
        : type === "external"
          ? { label: "Google", cls: "bg-emerald-600 text-white", Icon: CalendarIcon }
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

// Tiny client component for the engagement (client) filter dropdown.
function ClientFilter({
  engagements,
  currentEngagementId,
  view,
  anchorDate,
  types,
}: {
  engagements: Array<{ id: string; name: string }>;
  currentEngagementId: string | null;
  view: ViewMode;
  anchorDate: string;
  types: string | undefined;
}) {
  // Render as a form GET so we don't need a client component. The
  // submit handler is the URL itself.
  return (
    <form
      action="/business-builder/calendar"
      method="get"
      className="inline-flex items-center gap-1"
    >
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="date" value={anchorDate} />
      {types && <input type="hidden" name="types" value={types} />}
      <select
        name="engagement"
        defaultValue={currentEngagementId ?? "all"}
        className="bg-white border border-tbb-line rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-tbb-blue"
      >
        <option value="all">All clients</option>
        {engagements.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue px-2 py-1 hover:underline"
      >
        Apply
      </button>
    </form>
  );
}
