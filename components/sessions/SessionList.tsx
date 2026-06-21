/**
 * SessionList — server component, two sections (upcoming + past).
 * Card layout: a date chip, the time + format, a color-coded status pill,
 * and an optional notes preview.
 */

import Link from "next/link";
import { CalendarDays, MapPin, Video } from "lucide-react";
import type { ListedSession } from "@/lib/db/queries/bbs-sessions";
import { formatSessionTime, SESSION_STATUS_LABEL } from "./utils";

const TZ = "America/Edmonton";

function chipParts(d: Date): { month: string; day: string; weekday: string } {
  const date = new Date(d);
  return {
    month: date.toLocaleDateString("en-CA", { month: "short", timeZone: TZ }),
    day: date.toLocaleDateString("en-CA", { day: "numeric", timeZone: TZ }),
    weekday: date.toLocaleDateString("en-CA", { weekday: "short", timeZone: TZ }),
  };
}

function timeOnly(d: Date): string {
  return new Date(d).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function SessionList({
  upcoming,
  past,
  hrefBase,
  emptyHeadline,
  emptyDescription,
}: {
  upcoming: ListedSession[];
  past: ListedSession[];
  hrefBase: string;
  emptyHeadline: string;
  emptyDescription: string;
}) {
  const hasAny = upcoming.length > 0 || past.length > 0;
  if (!hasAny) {
    return (
      <div className="border border-dashed border-tbb-line rounded-xl bg-white p-8 text-center space-y-2">
        <CalendarDays className="w-7 h-7 text-tbb-blue mx-auto" aria-hidden />
        <p className="font-bold text-tbb-navy text-base tracking-tight">
          {emptyHeadline}
        </p>
        <p className="font-sans text-sm text-muted-foreground max-w-md mx-auto">
          {emptyDescription}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Upcoming
          </h2>
          <ul className="space-y-2.5">
            {upcoming.map((s) => (
              <SessionRow key={s.id} session={s} hrefBase={hrefBase} />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Past
          </h2>
          <ul className="space-y-2.5">
            {past.map((s) => (
              <SessionRow key={s.id} session={s} hrefBase={hrefBase} past />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SessionRow({
  session,
  hrefBase,
  past = false,
}: {
  session: ListedSession;
  hrefBase: string;
  past?: boolean;
}) {
  const isOverdue =
    session.status === "scheduled" && session.scheduledAt < new Date();
  const isCancelled = session.status === "cancelled";
  const statusLabel = isOverdue ? "Missed" : SESSION_STATUS_LABEL[session.status];
  const { month, day, weekday } = chipParts(session.scheduledAt);
  const isVirtual = session.type === "virtual";

  // Date chip tone: orange for missed, blue for completed, navy otherwise.
  const chipTone = isOverdue
    ? "bg-tbb-orange text-white"
    : session.status === "completed"
      ? "bg-tbb-blue text-white"
      : isCancelled
        ? "bg-tbb-line-soft text-tbb-ink-3"
        : "bg-tbb-navy text-white";

  const statusTone = isOverdue
    ? "bg-tbb-orange/15 text-tbb-orange"
    : session.status === "completed"
      ? "bg-tbb-blue/15 text-tbb-blue"
      : isCancelled
        ? "bg-tbb-line-soft text-tbb-ink-3 line-through"
        : "bg-tbb-success/15 text-tbb-success";

  return (
    <li>
      <Link
        href={`${hrefBase}/${session.id}`}
        className={
          "flex items-center gap-4 rounded-xl border border-tbb-line bg-white p-3 pr-4 shadow-tbb-xs hover:border-tbb-blue hover:shadow-tbb-sm transition-all group " +
          (isCancelled ? "opacity-70" : "")
        }
      >
        {/* Date chip */}
        <div
          className={
            "shrink-0 w-14 rounded-lg flex flex-col items-center justify-center py-1.5 " +
            chipTone
          }
        >
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps leading-none opacity-90">
            {month}
          </span>
          <span className="text-xl font-black leading-tight tabular-nums">
            {day}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-tbb-caps leading-none opacity-80">
            {weekday}
          </span>
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <p
            className={
              "font-bold text-tbb-navy tracking-tight group-hover:underline underline-offset-4 " +
              (isCancelled ? "line-through" : "")
            }
          >
            {timeOnly(session.scheduledAt)}
            <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
              {formatSessionTime(session.scheduledAt)}
            </span>
          </p>
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            {isVirtual ? (
              <Video className="w-3 h-3" aria-hidden />
            ) : (
              <MapPin className="w-3 h-3" aria-hidden />
            )}
            {isVirtual ? "Virtual" : "In-person"}
          </span>
          {session.notes && !past && (
            <p className="mt-1 font-sans text-sm text-muted-foreground line-clamp-1">
              {session.notes}
            </p>
          )}
        </div>

        {/* Status pill */}
        <span
          className={
            "shrink-0 font-mono text-[10px] font-bold uppercase tracking-tbb-caps px-2.5 py-1 rounded-pill " +
            statusTone
          }
        >
          {statusLabel}
        </span>
      </Link>
    </li>
  );
}
