/**
 * /business-builder/calendar — all client meetings across every
 * engagement on one screen. Defaults to "this week" but supports a
 * month view and any 7-day window via search params.
 *
 * Powered by the bbs_sessions table (every coaching session ever
 * scheduled) joined to engagements + orgs so each event shows the
 * client name. Read-only for now — Bruce schedules new sessions
 * from the per-engagement page; this is the panoramic view + a
 * "Suggest open slots" helper for scheduling.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { bbsSessions, engagements, orgs } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { SuggestSlotsPanel } from "./SuggestSlotsPanel";

type ViewMode = "week" | "month";

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
  // Week starts on Monday (Edmonton coaching practice norm).
  const n = startOfDay(d);
  const day = n.getDay(); // 0 = Sun ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(n, diff);
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
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

  const rangeStart =
    view === "month" ? startOfMonth(anchorDate) : startOfWeek(anchorDate);
  const rangeEnd =
    view === "month" ? endOfMonth(anchorDate) : addDays(rangeStart, 7);

  // Load every session in the visible range with its engagement label.
  const sessions = await withSystemContext(async (tx) =>
    tx
      .select({
        id: bbsSessions.id,
        scheduledAt: bbsSessions.scheduledAt,
        type: bbsSessions.type,
        status: bbsSessions.status,
        engagementId: bbsSessions.engagementId,
        engagementName: engagements.name,
        engagementType: engagements.type,
        orgName: orgs.name,
      })
      .from(bbsSessions)
      .leftJoin(engagements, eq(engagements.id, bbsSessions.engagementId))
      .leftJoin(orgs, eq(orgs.id, bbsSessions.orgId))
      .where(
        and(
          gte(bbsSessions.scheduledAt, rangeStart),
          lte(bbsSessions.scheduledAt, rangeEnd),
        ),
      )
      .orderBy(asc(bbsSessions.scheduledAt)),
  );

  // Bucket sessions by day for the grid render.
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = s.scheduledAt.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }

  // Date math for nav.
  const prevAnchor =
    view === "month"
      ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1)
      : addDays(rangeStart, -7);
  const nextAnchor =
    view === "month"
      ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1)
      : addDays(rangeStart, 7);

  const fmtIso = (d: Date) => d.toISOString().slice(0, 10);
  const buildHref = (v: ViewMode, d: Date) =>
    `/business-builder/calendar?view=${v}&date=${fmtIso(d)}`;

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

  // For the week view we render 7 day columns; for month we render
  // a full weeks-grid with leading/trailing fill.
  const cells: { date: Date; inRange: boolean }[] = [];
  if (view === "week") {
    for (let i = 0; i < 7; i++) {
      cells.push({ date: addDays(rangeStart, i), inRange: true });
    }
  } else {
    const firstCell = startOfWeek(rangeStart);
    // 6 rows × 7 days covers any month.
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

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="tbb-eyebrow">Schedule</p>
          <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight flex items-center gap-2">
            <CalendarIcon className="w-7 h-7" aria-hidden /> Calendar
          </h1>
          <p className="text-sm text-tbb-ink-3 max-w-2xl">
            Every coaching session, intro call, and check-in across every
            client. Switch between week and month view. Open slots show
            where you can drop a new client.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={buildHref(view, prevAnchor)}
            aria-label="Previous"
            className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-tbb-line bg-white text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden />
          </Link>
          <Link
            href={buildHref(view, new Date())}
            className="text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-md border border-tbb-line bg-white text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue"
          >
            Today
          </Link>
          <Link
            href={buildHref(view, nextAnchor)}
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
              href={buildHref("week", anchorDate)}
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
              href={buildHref("month", anchorDate)}
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

      <SuggestSlotsPanel />

      <div className="border border-tbb-line rounded-lg bg-white overflow-hidden shadow-tbb-sm">
        {/* Day-of-week header */}
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
                  {dayEvents.length > 2 && (
                    <span className="text-[10px] text-tbb-ink-3">
                      {dayEvents.length}
                    </span>
                  )}
                </div>
                <ul className="space-y-1">
                  {dayEvents.slice(0, 3).map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/business-builder/sessions/${e.engagementId}`}
                        className="block px-1.5 py-1 rounded text-[10px] leading-snug bg-tbb-blue-50 border-l-2 border-tbb-blue text-tbb-navy hover:bg-tbb-blue-100"
                      >
                        <span className="font-bold tabular-nums">
                          {e.scheduledAt.toLocaleTimeString("en-CA", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="block truncate">
                          {e.engagementName ?? e.orgName ?? "Session"}
                        </span>
                      </Link>
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

      {/* List view below the grid — gives Bruce a scannable lineup
          for the visible range, with full session names that get
          truncated in the grid cells. */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-tbb-caps text-tbb-ink-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-tbb-blue" aria-hidden />
          {sessions.length} session{sessions.length === 1 ? "" : "s"} in this {view}
        </h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-tbb-ink-3 italic">
            Nothing scheduled in this {view}. Switch to {view === "week" ? "month" : "week"} view
            or use Today to jump back.
          </p>
        ) : (
          <ul className="border border-tbb-line rounded-lg bg-white divide-y divide-tbb-line-soft overflow-hidden shadow-tbb-sm">
            {sessions.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <Link
                  href={`/business-builder/sessions/${s.engagementId}`}
                  className="flex items-baseline justify-between gap-3 flex-wrap hover:text-tbb-blue"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue tabular-nums w-32 shrink-0">
                      {s.scheduledAt.toLocaleString("en-CA", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="font-bold text-tbb-navy">
                      {s.engagementName ?? s.orgName ?? "Session"}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 bg-tbb-cream-50 px-1.5 py-0.5 rounded-pill">
                      {s.type.replace(/_/g, " ")}
                    </span>
                  </span>
                  <span
                    className={
                      "text-[10px] font-bold uppercase tracking-tbb-caps px-1.5 py-0.5 rounded-pill " +
                      (s.status === "completed"
                        ? "bg-white text-tbb-success border border-tbb-success/30"
                        : s.status === "cancelled"
                          ? "bg-white text-tbb-danger border border-tbb-danger/30"
                          : "bg-tbb-blue-50 text-tbb-blue border border-tbb-blue/30")
                    }
                  >
                    {s.status.replace(/_/g, " ")}
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
