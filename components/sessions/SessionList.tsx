/**
 * SessionList — server component, two sections (upcoming + past).
 */

import Link from "next/link";
import type { ListedSession } from "@/lib/db/queries/bbs-sessions";
import {
  formatSessionTime,
  SESSION_STATUS_LABEL,
  SESSION_TYPE_LABEL,
} from "./utils";

export function SessionList({
  upcoming,
  past,
  hrefBase,
  emptyHeadline,
  emptyDescription,
}: {
  upcoming: ListedSession[];
  past: ListedSession[];
  /** e.g. "/portal/sessions" or "/coach/sessions/<engagementId>". */
  hrefBase: string;
  emptyHeadline: string;
  emptyDescription: string;
}) {
  const hasAny = upcoming.length > 0 || past.length > 0;
  if (!hasAny) {
    return (
      <div className="border border-[#CCCCCC] rounded-md bg-white p-6 space-y-2">
        <p className="font-display font-bold text-foreground text-base tracking-tight">
          {emptyHeadline}
        </p>
        <p className="font-sans text-sm text-muted-foreground">
          {emptyDescription}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Upcoming
          </h2>
          <ul className="divide-y divide-[#CCCCCC] border-t border-b border-[#CCCCCC]">
            {upcoming.map((s) => (
              <SessionRow key={s.id} session={s} hrefBase={hrefBase} />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Past
          </h2>
          <ul className="divide-y divide-[#CCCCCC] border-t border-b border-[#CCCCCC]">
            {past.map((s) => (
              <SessionRow key={s.id} session={s} hrefBase={hrefBase} />
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
}: {
  session: ListedSession;
  hrefBase: string;
}) {
  const isOverdue =
    session.status === "scheduled" &&
    session.scheduledAt < new Date();
  const statusLabel = isOverdue
    ? "Missed"
    : SESSION_STATUS_LABEL[session.status];
  const accent =
    session.status === "completed"
      ? "border-[#2E4057]"
      : isOverdue
        ? "border-[#E87722]"
        : "border-transparent";
  return (
    <li>
      <Link
        href={`${hrefBase}/${session.id}`}
        className={
          "block py-3 pl-3 border-l-2 group hover:bg-[#F5F1E8] transition-colors " +
          accent
        }
      >
        <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
          <span className="font-sans text-sm font-bold text-foreground group-hover:underline underline-offset-4">
            {formatSessionTime(session.scheduledAt)}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            {SESSION_TYPE_LABEL[session.type]}
          </span>
          <span
            className={
              "ml-auto font-mono text-[10px] uppercase tracking-[0.2em] " +
              (isOverdue
                ? "text-[#E87722] font-bold"
                : session.status === "completed"
                  ? "text-[#2E4057] font-bold"
                  : session.status === "cancelled"
                    ? "text-muted-foreground line-through"
                    : "text-muted-foreground")
            }
          >
            {statusLabel}
          </span>
        </div>
        {session.notes && (
          <p className="mt-1 font-sans text-sm text-muted-foreground line-clamp-2">
            {session.notes}
          </p>
        )}
      </Link>
    </li>
  );
}
