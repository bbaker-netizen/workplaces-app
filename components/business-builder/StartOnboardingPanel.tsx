"use client";

/**
 * Start onboarding — one button, three sends, with the pre-flight shown
 * before it is pressed rather than after.
 *
 * The blockers are rendered up front, each with a link to the thing that
 * fixes it. A refusal that only appears on click, and only says "not
 * ready", makes the operator guess which of four conditions it meant.
 *
 * **Why this collapses.** The panel is only useful for a client who has
 * not been onboarded yet, and that is a handful of days out of an
 * engagement that runs for years. Left at full size it sits at the top of
 * every client page for ever, showing an orange "not ready" box against
 * clients who were onboarded long before this flow existed — which reads
 * as outstanding work rather than history. Measured against the live book
 * when this was written: 17 of 18 active clients were in exactly that
 * state.
 *
 * So an established client gets one quiet line instead. It COLLAPSES
 * rather than disappears: "established" is inferred (see `established`
 * below), and an inference that is wrong must still leave the operator a
 * way through. Nothing is ever hidden outright.
 *
 * **What `established` must NOT do — the 2026-08-05 fault.** It used to
 * also ungate the button and hide the blocker list and the fields that
 * fix them. The server has no such exemption: `startOnboarding` runs the
 * same pre-flight for every client and refuses. So on an established
 * client with a blocker the panel showed an enabled button, no blockers,
 * and no fee or schedule control — press it, confirm the three
 * irreversible sends, and get back "One thing needs sorting" with no
 * indication of what or where. Measured against the live book at the
 * time: 15 of 21 engagements were in exactly that state.
 *
 * The rule now: the button is gated on the SAME blockers the server
 * checks, always, and whatever fixes them renders beside them. What
 * `established` still decides is presentation — whether the panel opens
 * collapsed, and whether the copy frames onboarding as a task or as
 * history.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  Rocket,
} from "lucide-react";
import {
  resumeOnboarding,
  startOnboarding,
} from "@/lib/actions/start-onboarding";
import type { OnboardingBlocker } from "@/lib/onboarding/preflight";

export type OnboardingRunState = {
  startedAt: Date;
  welcomeEmailSentAt: Date | null;
  welcomeEmailError: string | null;
  padSentAt: Date | null;
  padError: string | null;
  portalInviteSentAt: Date | null;
  portalInviteError: string | null;
  assessmentSentAt: Date | null;
  assessmentError: string | null;
  completedAt: Date | null;
  /**
   * Hand-off bookkeeping. `backgroundStartedAt` is stamped by the runner
   * itself — the hand-off's own 202 arrives before the handler runs, so
   * it is not evidence of anything. Without these the panel cannot tell
   * "still going" from "never arrived". See migration 0121.
   */
  lastQueuedAt: Date | null;
  backgroundStartedAt: Date | null;
  backgroundError: string | null;
} | null;

const STEPS = [
  {
    key: "welcome" as const,
    label: "Onboarding email",
    detail: "From your own Gmail. Tells them the next two are coming.",
  },
  {
    key: "pad" as const,
    label: "Payment authorization form",
    detail: "Sent for signature. Sets up the monthly retainer.",
  },
  {
    key: "invite" as const,
    label: "Portal invitation",
    detail: "Creates their login and drops them into their workspace.",
  },
  {
    key: "assessment" as const,
    label: "Person Profile assessment",
    detail:
      "The link, to every participant. Last because it is the only step that asks them for time.",
  },
];

export function StartOnboardingPanel({
  engagementId,
  clientName,
  clientEmail,
  blockers,
  run,
  established,
  nowMs,
  setupFields = null,
  schedulePanel = null,
}: {
  engagementId: string;
  /** For the confirm dialog, so it names who is about to be emailed. */
  clientName: string;
  /**
   * The address all three steps go to, or null when there isn't one (in
   * which case `blockers` carries the contact_email blocker and the
   * button is gated anyway). A confirm that says "this cannot be
   * recalled" without saying who receives it is alarming and
   * uncheckable — the recipient is the one fact that makes it either.
   */
  clientEmail: string | null;
  blockers: OnboardingBlocker[];
  run: OnboardingRunState;
  /**
   * The fee + assessment-date fields, passed in as a slot rather than
   * built here. They are server-fed (current values, and a suggested
   * date worked back from the first session), and this panel is a client
   * component — a slot keeps that data on the server where it belongs
   * instead of threading four more props through.
   *
   * Rendered only while onboarding is still ahead of this client: once
   * it has run, these live on the client page proper.
   */
  setupFields?: React.ReactNode;
  /** The recurring-sessions panel, same reasoning as `setupFields`. */
  schedulePanel?: React.ReactNode;
  /**
   * This client is already up and running — they hold a real Clerk org
   * (someone invited them to the portal) or a session has already been
   * held. Either way onboarding happened, outside this flow, and the
   * panel is history rather than a task.
   *
   * Deliberately NOT "the engagement is more than N days old": age is a
   * guess, whereas an invitation sent and a session held are both things
   * that actually occurred.
   */
  established: boolean;
  /** Server-rendered `Date.now()` — keeps the stall clock deterministic
   *  across the server render and hydration. */
  nowMs: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /**
   * Blockers the SERVER refused on. Normally identical to the ones
   * rendered from props, but the page is a snapshot: another Builder can
   * change the record in the meantime, and the fee can be cleared from
   * the contact profile in another tab. When the refusal disagrees with
   * what is on screen, the refusal is the truth — so it is rendered
   * rather than reduced to a count.
   */
  const [serverBlockers, setServerBlockers] = useState<OnboardingBlocker[]>([]);
  const [expanded, setExpanded] = useState(false);

  const sentAt = (k: (typeof STEPS)[number]["key"]) =>
    k === "welcome"
      ? run?.welcomeEmailSentAt
      : k === "pad"
        ? run?.padSentAt
        : k === "invite"
          ? run?.portalInviteSentAt
          : run?.assessmentSentAt;
  const errorFor = (k: (typeof STEPS)[number]["key"]) =>
    k === "welcome"
      ? run?.welcomeEmailError
      : k === "pad"
        ? run?.padError
        : k === "invite"
          ? run?.portalInviteError
          : run?.assessmentError;

  // The assessment step is deliberately absent from this list. It records
  // a message on `assessmentError` when it SKIPS for want of a configured
  // link, and a skip is not a failure — treating it as one would put a
  // completed run permanently in the red.
  const anyFailure = Boolean(
    run &&
      !run.completedAt &&
      (run.welcomeEmailError || run.padError || run.portalInviteError),
  );

  /**
   * A run that started and has not finished always shows in full — whether
   * it is mid-flight or stalled on an error, it is the one state that
   * needs the operator's eyes. Everything else can be collapsed.
   */
  /**
   * A run is STALLED when it has been waiting long enough that "still
   * going" is no longer a credible reading.
   *
   * The steps are two minutes apart, so ten minutes without the next one
   * landing means something is wrong — either the hand-off never reached
   * the runner (`backgroundStartedAt` null, which is the case the 202
   * used to hide) or the runner picked it up and died. Both leave the
   * operator waiting on something that will never arrive, and both are
   * fixed by the same button.
   */
  const STALL_AFTER_MS = 10 * 60 * 1000;
  const lastMovement = run
    ? Math.max(
        new Date(run.backgroundStartedAt ?? run.startedAt).getTime(),
        new Date(run.lastQueuedAt ?? run.startedAt).getTime(),
      )
    : 0;
  // Server-rendered clock, same reason as `ActionItemListClient`: a
  // client component evaluating Date.now() renders one value on the
  // server and another on hydration, and this one decides which of two
  // different sentences appears.
  const stalledMs = run && !run.completedAt ? nowMs - lastMovement : 0;
  const stalled = Boolean(
    run && !run.completedAt && (run.backgroundError || stalledMs > STALL_AFTER_MS),
  );
  const stalledFor =
    stalledMs > 90 * 60 * 1000
      ? `${Math.round(stalledMs / 3_600_000)} hours`
      : `${Math.max(1, Math.round(stalledMs / 60_000))} minutes`;

  const needsAttention = Boolean(run && !run.completedAt);
  const collapsible = !needsAttention && (Boolean(run?.completedAt) || established);
  const showFull = !collapsible || expanded;

  /**
   * Onboarding is still ahead of this client, so the setup it needs —
   * and the reasons it can't start yet — belong on screen. Keyed off the
   * run and NOT off `established`: an established client is one we don't
   * expect to onboard, not one whose fee and schedule stop existing.
   */
  const preRun = !run;

  const go = (fn: (id: string) => Promise<unknown>, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setError(null);
    setServerBlockers([]);
    startTransition(async () => {
      const r = (await fn(engagementId)) as {
        ok: boolean;
        error?: string;
        blockers?: OnboardingBlocker[];
      };
      if (!r.ok) {
        setError(r.error ?? "Couldn't start onboarding.");
        setServerBlockers(r.blockers ?? []);
      }
      router.refresh();
    });
  };

  // Collapsed: one line, and a way back to the whole thing.
  if (!showFull) {
    const completedAt = run?.completedAt;
    return (
      <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm px-5 py-3 flex items-center gap-3 flex-wrap">
        {completedAt ? (
          <Check className="w-4 h-4 text-tbb-blue flex-none" aria-hidden />
        ) : (
          <Rocket className="w-4 h-4 text-tbb-ink-4 flex-none" aria-hidden />
        )}
        <p className="text-xs text-tbb-ink-3 flex-1 min-w-0">
          {completedAt ? (
            <>
              <span className="font-bold text-tbb-navy">Onboarding sent</span>{" "}
              — all three steps went out{" "}
              {new Date(completedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              .
            </>
          ) : (
            <>
              <span className="font-bold text-tbb-navy">Onboarding</span> —
              this client is already up and running, so there&apos;s nothing
              to send.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline flex-none"
        >
          Show
          <ChevronDown className="w-3 h-3" aria-hidden />
        </button>
      </section>
    );
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm">
      <header className="px-5 py-3 border-b border-tbb-line bg-tbb-cream-50 flex items-center gap-2">
        <Rocket className="w-4 h-4 text-tbb-blue" aria-hidden />
        <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 flex-1">
          Start onboarding
        </p>
        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-blue hover:underline"
          >
            Hide
          </button>
        )}
      </header>

      <div className="p-5 space-y-4">
        {established && !run && (
          <p className="rounded-md border border-tbb-line-soft bg-tbb-cream-50 px-3 py-2 text-xs text-tbb-ink-2">
            This client already has a portal or sessions on the books, so
            they were almost certainly onboarded before this button existed.
            Running it would email them the whole welcome sequence again.{" "}
            <span className="font-bold">
              To give them portal access without the welcome sequence, use
              &ldquo;Invite client&rdquo; under Client access below.
            </span>
          </p>
        )}

        <p className="text-xs text-tbb-ink-3 max-w-2xl">
          Sends all three onboarding items in order, a couple of minutes
          apart, so the client reads what&apos;s coming before the payment
          form and the portal invite land.
        </p>

        <ol className="space-y-2">
          {STEPS.map((s, i) => {
            const done = sentAt(s.key);
            const failed = errorFor(s.key);
            return (
              <li
                key={s.key}
                className="flex items-start gap-3 rounded-md border border-tbb-line-soft px-3 py-2"
              >
                <span
                  className={
                    "mt-0.5 w-5 h-5 rounded-full flex-none text-[10px] font-bold flex items-center justify-center " +
                    (done
                      ? "bg-tbb-blue text-white"
                      : failed
                        ? "bg-tbb-danger text-white"
                        : "border border-tbb-line text-tbb-ink-4")
                  }
                >
                  {done ? <Check className="w-3 h-3" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-tbb-navy">
                    {s.label}
                  </span>
                  <span className="block text-[11px] text-tbb-ink-3">
                    {done
                      ? `Sent ${new Date(done).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}`
                      : s.detail}
                  </span>
                  {failed && (
                    <span className="block mt-1 text-[11px] text-tbb-danger">
                      {failed}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        {/* The setup a client needs before the sends make sense, right
            where the pre-flight complains about it. The fee blocker used
            to link to a page with no fee control on it — a refusal that
            names a fix you cannot perform is worse than no refusal, and
            excluding established clients here recreated exactly that. */}
        {preRun && setupFields}
        {preRun && schedulePanel}

        {/* Pre-flight. Shown before the button, not after the click, and
            for every client the button is offered to. */}
        {preRun && blockers.length > 0 && (
          <div className="rounded-md border border-tbb-blue/50 bg-tbb-blue/5 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
              {established
                ? `Onboarding can't run — ${blockers.length} ${
                    blockers.length === 1 ? "thing" : "things"
                  } missing`
                : `Not ready yet — ${blockers.length} ${
                    blockers.length === 1 ? "thing" : "things"
                  } to fix first`}
            </p>
            <ul className="space-y-2">
              {blockers.map((b) => (
                <li key={b.key} className="text-xs text-tbb-ink-2">
                  {b.message}{" "}
                  <Link
                    href={b.href}
                    className="inline-flex items-center gap-0.5 font-bold text-tbb-blue hover:underline whitespace-nowrap"
                  >
                    {b.linkLabel}
                    <ArrowRight className="w-3 h-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-tbb-ink-3">
              {established
                ? "These are only needed to run the welcome sequence. If this client is already going, nothing here is outstanding — leave it."
                : "These can't be skipped. Once the first two emails have gone they can't be recalled, so a blocked start is safer than a half-finished one."}
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-tbb-danger/50 bg-tbb-danger/5 p-3 space-y-2" role="alert">
            <p className="text-sm text-tbb-danger">{error}</p>
            {/* The server refused on something the page didn't know
                about. Show it with its fix rather than leaving the
                operator to guess which of four checks it meant. */}
            {serverBlockers.length > 0 && (
              <ul className="space-y-2">
                {serverBlockers.map((b) => (
                  <li key={b.key} className="text-xs text-tbb-ink-2">
                    {b.message}{" "}
                    <Link
                      href={b.href}
                      className="inline-flex items-center gap-0.5 font-bold text-tbb-blue hover:underline whitespace-nowrap"
                    >
                      {b.linkLabel}
                      <ArrowRight className="w-3 h-3" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {run?.completedAt ? (
          <p className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue">
            <Check className="w-3.5 h-3.5 inline mr-1" aria-hidden />
            Onboarding complete
          </p>
        ) : run ? (
          /* A run that has not finished. Three states that used to render
             as one endless spinner:

               - genuinely mid-flight (picked up, recently),
               - stalled (handed off, never picked up, or picked up and
                 gone quiet), and
               - failed on a step.

             The old copy said "In progress … refresh to see where it's
             got to" for all three, which is an instruction to keep
             waiting for something that may never happen. A real client
             sat behind it for a working day. Every one of them now
             carries the same button, because pressing it sends the next
             step here and now rather than asking a background job to. */
          <div className="space-y-2">
            {stalled ? (
              <p className="text-xs text-tbb-danger">
                <AlertTriangle
                  className="w-3.5 h-3.5 inline mr-1"
                  aria-hidden
                />
                {run.backgroundError
                  ? run.backgroundError
                  : `Stalled — the sequence was handed off ${stalledFor} ago and the runner never picked it up. Nothing further has been sent.`}
              </p>
            ) : anyFailure ? (
              <p className="text-xs text-tbb-danger">
                <AlertTriangle
                  className="w-3.5 h-3.5 inline mr-1"
                  aria-hidden
                />
                A step failed. Nothing after it has been sent.
              </p>
            ) : (
              <p className="text-xs text-tbb-ink-3">
                <Loader2
                  className="w-3.5 h-3.5 inline mr-1 animate-spin"
                  aria-hidden
                />
                In progress — the remaining steps send a couple of minutes
                apart.
              </p>
            )}
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                go(
                  resumeOnboarding,
                  "Send the next outstanding step now? Anything already delivered is never re-sent.",
                )
              }
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <Rocket className="w-3.5 h-3.5" aria-hidden />
              )}
              Send the next step now
            </button>
          </div>
        ) : (
          /* A disabled button with no explanation reads as broken. When
             it is blocked it says so on its face — a padlock, the word
             blocked, and a tooltip naming the count — so the orange box
             above is understood as the cause rather than as decoration. */
          <button
            type="button"
            disabled={isPending || blockers.length > 0}
            title={
              blockers.length > 0
                ? `Blocked: ${blockers.length} ${
                    blockers.length === 1 ? "thing" : "things"
                  } listed above must be fixed first.`
                : undefined
            }
            onClick={() =>
              go(
                startOnboarding,
                `Start onboarding for ${clientName}?\n\nThis emails ${
                  clientEmail ?? "the client"
                } three times over the next few minutes — the onboarding note, the payment authorization form, and their portal invitation. None of them can be recalled.`,
              )
            }
            className={
              "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill disabled:cursor-not-allowed " +
              (blockers.length > 0
                ? "border border-tbb-line bg-tbb-cream-50 text-tbb-ink-3"
                : "bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-40")
            }
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : blockers.length > 0 ? (
              <Lock className="w-3.5 h-3.5" aria-hidden />
            ) : (
              <Rocket className="w-3.5 h-3.5" aria-hidden />
            )}
            {blockers.length > 0
              ? "Start onboarding — blocked"
              : "Start onboarding"}
          </button>
        )}
      </div>
    </section>
  );
}
