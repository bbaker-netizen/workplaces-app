"use client";

/**
 * Start onboarding — one button, three sends, with the pre-flight shown
 * before it is pressed rather than after.
 *
 * The blockers are rendered up front, each with a link to the thing that
 * fixes it. A refusal that only appears on click, and only says "not
 * ready", makes the operator guess which of four conditions it meant.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
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
}: {
  engagementId: string;
  blockers: OnboardingBlocker[];
  run: OnboardingRunState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm">
      <header className="px-5 py-3 border-b border-tbb-line bg-tbb-cream-50 flex items-center gap-2">
        <Rocket className="w-4 h-4 text-tbb-blue" aria-hidden />
        <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Start onboarding
        </p>
      </header>

      <div className="p-5 space-y-4">
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
        {!run && blockers.length > 0 && (
          <div className="rounded-md border border-tbb-accent/50 bg-tbb-accent/5 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-accent">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
              Not ready yet
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
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-accent text-white hover:opacity-90 disabled:opacity-50"
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
          <button
            type="button"
            disabled={isPending || blockers.length > 0}
            onClick={() =>
              go(
                startOnboarding,
                "Start onboarding? This emails the client three times over the next few minutes — the onboarding note, the payment authorization form, and their portal invitation. None of them can be recalled.",
              )
            }
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Rocket className="w-3.5 h-3.5" aria-hidden />
            )}
            Start onboarding
          </button>
        )}
      </div>
    </section>
  );
}
