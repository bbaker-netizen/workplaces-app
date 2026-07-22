/**
 * Team — the practice's own workspace.
 *
 * Internal touch-bases and the commitments Business Builders task each
 * other with. Distinct from every client-facing surface: this lives in
 * the internal engagement (engagements.is_internal), which is filtered
 * out of every client list.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Plus, Users, Video } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  ensureInternalEngagementId,
  isInternalRole,
  listInternalTeammates,
} from "@/lib/db/queries/internal-workspace";
import {
  getTeamWorkspaceOverview,
  listTeamCommitments,
  type TeamMeeting,
} from "@/lib/db/queries/team-workspace";
import { describeCadence, type Cadence } from "@/lib/scheduling/recurrence";
import { LinkGoogleSeries } from "@/components/team/LinkGoogleSeries";
import { LinkedSeriesRow } from "@/components/team/LinkedSeriesRow";

export const dynamic = "force-dynamic";

const TZ = "America/Edmonton";

function dayChip(d: Date) {
  return {
    month: d.toLocaleDateString("en-CA", { month: "short", timeZone: TZ }),
    day: d.toLocaleDateString("en-CA", { day: "numeric", timeZone: TZ }),
    weekday: d.toLocaleDateString("en-CA", { weekday: "short", timeZone: TZ }),
  };
}

function timeOnly(d: Date) {
  return d.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export default async function TeamPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (!isInternalRole(profile.role)) redirect("/portal");

  // Provision the workspace on first visit so there's nothing to run
  // before the module works.
  const engagementId = await ensureInternalEngagementId();
  if (!engagementId) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="rounded-xl border border-dashed border-tbb-line bg-white p-8 text-center font-sans text-sm text-muted-foreground">
          The team workspace needs at least one active Business Builder before
          it can be set up. Add one under Settings → Team.
        </p>
      </main>
    );
  }

  const [overview, commitments, teammates] = await Promise.all([
    getTeamWorkspaceOverview(),
    listTeamCommitments(),
    listInternalTeammates(),
  ]);

  const series = overview?.series ?? [];
  const upcoming = overview?.upcoming ?? [];
  const past = overview?.past ?? [];

  // Group open commitments by owner — "who owes what" is the question
  // this page exists to answer at a glance.
  const byOwner = new Map<string, typeof commitments>();
  for (const c of commitments) {
    const key = c.assigneeName ?? "Unassigned";
    byOwner.set(key, [...(byOwner.get(key) ?? []), c]);
  }
  const owners = Array.from(byOwner.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 sm:py-12 space-y-10">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-tbb-navy tracking-tight">
          Team
        </h1>
        <p className="font-sans text-sm text-muted-foreground max-w-xl">
          Your touch-bases with the rest of the practice, the agenda for each
          one, and every commitment you&rsquo;ve made to each other.
          {teammates.length > 0 && (
            <>
              {" "}
              <span className="inline-flex items-center gap-1 align-middle">
                <Users className="w-3.5 h-3.5" aria-hidden />
                {teammates.map((t) => t.fullName).join(", ")}
              </span>
            </>
          )}
        </p>
      </header>

      {/* Linked calendar --------------------------------------------- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-tbb-navy text-lg tracking-tight">
            Recurring meetings
          </h2>
          {series.length === 0 && <LinkGoogleSeries />}
        </div>
        {series.length === 0 ? (
          <p className="rounded-xl border border-dashed border-tbb-line bg-white p-6 text-center font-sans text-sm text-muted-foreground">
            Link the recurring touch-base from your Google Calendar. You keep
            managing the schedule in Google; The Builder mirrors each meeting
            here and adds the agenda on top.
          </p>
        ) : (
          <ul className="space-y-2">
            {series.map((s) => (
              <LinkedSeriesRow
                key={s.id}
                seriesId={s.id}
                title={s.title}
                scheduleHint={
                  s.source === "google"
                    ? "Recurring"
                    : s.anchorAt && s.cadence
                      ? describeCadence(s.anchorAt, s.cadence as Cadence)
                      : "Recurring"
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* Meetings ----------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="font-bold text-tbb-navy text-lg tracking-tight">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-tbb-line bg-white p-6 text-center font-sans text-sm text-muted-foreground">
            Nothing scheduled.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {upcoming.map((m) => (
              <MeetingRow key={m.id} meeting={m} />
            ))}
          </ul>
        )}
      </section>

      {/* Commitments -------------------------------------------------- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-tbb-navy text-lg tracking-tight">
            Who owes what
          </h2>
          {/* Tasking a teammate shouldn't require a meeting to hang it
              off — the agenda route covers "this came out of a
              discussion", this covers everything else. */}
          <Link
            href={`/business-builder/action-items/new?engagement=${engagementId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-tbb-line bg-white px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden />
            Task a teammate
          </Link>
        </div>
        {owners.length === 0 ? (
          <p className="rounded-xl border border-dashed border-tbb-line bg-white p-6 text-center font-sans text-sm text-muted-foreground">
            No open commitments between the team right now.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {owners.map(([owner, items]) => (
              <div
                key={owner}
                className="rounded-xl border border-tbb-line bg-white p-4 shadow-tbb-xs space-y-2"
              >
                <p className="font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  {owner} · {items.length}
                </p>
                <ul className="space-y-1.5">
                  {items.map((it) => {
                    const overdue =
                      it.dueDate !== null && it.dueDate < new Date();
                    return (
                      <li key={it.id}>
                        <Link
                          href={`/business-builder/action-items/${it.id}`}
                          className="group flex items-baseline gap-2 flex-wrap"
                        >
                          <span className="font-sans text-sm text-tbb-navy group-hover:underline underline-offset-4">
                            {it.title}
                          </span>
                          {it.dueDate && (
                            <span
                              className={
                                "font-mono text-[10px] uppercase tracking-tbb-caps " +
                                (overdue
                                  ? "text-tbb-orange font-bold"
                                  : "text-tbb-ink-3")
                              }
                            >
                              {overdue ? "Overdue " : "Due "}
                              {it.dueDate.toLocaleDateString("en-CA", {
                                timeZone: TZ,
                              })}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past --------------------------------------------------------- */}
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Past meetings
          </h2>
          <ul className="space-y-2.5">
            {past.map((m) => (
              <MeetingRow key={m.id} meeting={m} past />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function MeetingRow({
  meeting,
  past = false,
}: {
  meeting: TeamMeeting;
  past?: boolean;
}) {
  const { month, day, weekday } = dayChip(meeting.scheduledAt);
  const isVirtual = meeting.type === "virtual";
  const isNext = !past;

  return (
    <li>
      <Link
        href={`/business-builder/team/${meeting.id}`}
        className="flex items-center gap-4 rounded-xl border border-tbb-line bg-white p-3 pr-4 shadow-tbb-xs hover:border-tbb-blue hover:shadow-tbb-sm transition-all group"
      >
        <div
          className={
            "shrink-0 w-14 rounded-lg flex flex-col items-center justify-center py-1.5 " +
            (isNext ? "bg-tbb-navy text-white" : "bg-tbb-line-soft text-tbb-ink-3")
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

        <div className="flex-1 min-w-0">
          <p className="font-bold text-tbb-navy tracking-tight group-hover:underline underline-offset-4">
            {meeting.title ?? "Team meeting"}
          </p>
          <span className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            {isVirtual ? (
              <Video className="w-3 h-3" aria-hidden />
            ) : (
              <MapPin className="w-3 h-3" aria-hidden />
            )}
            {timeOnly(meeting.scheduledAt)} · {meeting.durationMin} min
          </span>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1">
          {meeting.pendingAgendaCount > 0 && (
            <span className="font-mono text-[10px] font-bold uppercase tracking-tbb-caps px-2 py-0.5 rounded-pill bg-tbb-navy/10 text-tbb-navy">
              {meeting.pendingAgendaCount} agenda
            </span>
          )}
          {meeting.openActionCount > 0 && (
            <span className="font-mono text-[10px] font-bold uppercase tracking-tbb-caps px-2 py-0.5 rounded-pill bg-tbb-orange/15 text-tbb-orange">
              {meeting.openActionCount} open
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
