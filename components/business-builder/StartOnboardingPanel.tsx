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
  completedAt: Date | null;
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
];

export function StartOnboardingPanel({
  engagementId,
  blockers,
  run,
  established,
}: {
  engagementId: string;
  blockers: OnboardingBlocker[];
  run: OnboardingRunState;
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
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const sentAt = (k: (typeof STEPS)[number]["key"]) =>
    k === "welcome"
      ? run?.welcomeEmailSentAt
      : k === "pad"
        ? run?.padSentAt
        : run?.portalInviteSentAt;
  const errorFor = (k: (typeof STEPS)[number]["key"]) =>
    k === "welcome"
      ? run?.welcomeEmailError
      : k === "pad"
        ? run?.padError
        : run?.portalInviteError;

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
  const needsAttention = Boolean(run && !run.completedAt);
  // An established client's readiness blockers are not blockers —
  // they are checks on a sequence that should not run for this client
  // at all. Treating them as such is what made a two-year client read
  // as "not ready", and pointed the operator at scheduling a session
  // they had already been holding for two years.
  const gatingBlockers = established ? [] : blockers;
  const collapsible = !needsAttention && (Boolean(run?.completedAt) || established);
  const showFull = !collapsible || expanded;

  const go = (fn: (id: string) => Promise<unknown>, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const r = (await fn(engagementId)) as {
        ok: boolean;
        error?: string;
      };
      if (!r.ok) setError(r.error ?? "Couldn't start onboarding.");
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

        {/* Pre-flight. Shown before the button, not after the click. */}
        {!run && !established && blockers.length > 0 && (
          <div className="rounded-md border border-tbb-blue/50 bg-tbb-blue/5 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
              Not ready yet — {blockers.length}{" "}
              {blockers.length === 1 ? "thing" : "things"} to fix first
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
              These can&apos;t be skipped. Once the first two emails have gone
              they can&apos;t be recalled, so a blocked start is safer than a
              half-finished one.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-tbb-danger" role="alert">
            {error}
          </p>
        )}

        {run?.completedAt ? (
          <p className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue">
            <Check className="w-3.5 h-3.5 inline mr-1" aria-hidden />
            Onboarding complete
          </p>
        ) : anyFailure ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              go(
                resumeOnboarding,
                "Resume onboarding? Only the steps that haven't been sent will run — nothing already delivered is re-sent.",
              )
            }
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Rocket className="w-3.5 h-3.5" aria-hidden />
            )}
            Resume onboarding
          </button>
        ) : run ? (
          <p className="text-xs text-tbb-ink-3">
            <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" aria-hidden />
            In progress — the remaining steps send a couple of minutes apart.
            Refresh to see where it&apos;s got to.
          </p>
        ) : (
          /* A disabled button with no explanation reads as broken. When
             it is blocked it says so on its face — a padlock, the word
             blocked, and a tooltip naming the count — so the orange box
             above is understood as the cause rather than as decoration. */
          <button
            type="button"
            disabled={isPending || gatingBlockers.length > 0}
            title={
              gatingBlockers.length > 0
                ? `Blocked: ${blockers.length} ${
                    blockers.length === 1 ? "thing" : "things"
                  } listed above must be fixed first.`
                : undefined
            }
            onClick={() =>
              go(
                startOnboarding,
                "Start onboarding? This emails the client three times over the next few minutes — the onboarding note, the payment authorization form, and their portal invitation. None of them can be recalled.",
              )
            }
            className={
              "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill disabled:cursor-not-allowed " +
              (gatingBlockers.length > 0
                ? "border border-tbb-line bg-tbb-cream-50 text-tbb-ink-3"
                : "bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-40")
            }
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : gatingBlockers.length > 0 ? (
              <Lock className="w-3.5 h-3.5" aria-hidden />
            ) : (
              <Rocket className="w-3.5 h-3.5" aria-hidden />
            )}
            {gatingBlockers.length > 0
              ? "Start onboarding — blocked"
              : "Start onboarding"}
          </button>
        )}
      </div>
    </section>
  );
}
