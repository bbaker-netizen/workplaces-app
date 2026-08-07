/**
 * Whether each booking page is actually offering times, and why not.
 *
 * The gap this closes: `listAvailableSlots` fails CLOSED, so when a
 * Builder's calendar cannot be read their public page silently offers
 * nothing. That is the right behaviour — a dark page is recoverable, a
 * double-booked client session is not — but it was invisible to the
 * person whose page it is. "Booked solid", "Google disconnected" and
 * "the calendar read is erroring" all rendered as the same empty list,
 * and the first person to notice would have been a prospect who gave up.
 *
 * Server component. The credential probe below reaches Google and must
 * never run in a browser.
 */

import Link from "next/link";
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { DateTime } from "luxon";
import type { SchedulingLinkRow } from "@/lib/db/queries/scheduling-links";
import { diagnoseGoogleCredentials } from "@/lib/integrations/google-diagnostics";

const TZ = "America/Edmonton";

function when(d: Date | null): string {
  if (!d) return "never";
  return DateTime.fromJSDate(d).setZone(TZ).toFormat("ccc LLL d, h:mm a 'MT'");
}

/** Operator-facing sentence for each machine reason. */
function explain(reason: string | null): string {
  switch (reason) {
    case "ok":
      return "Calendar read fine.";
    case "not-connected":
      return "No Google account is connected, so every time is treated as busy.";
    case "calendar-error":
      return "Google refused the calendar read, so every time is treated as busy.";
    case "session-read-error":
      return "The app's own session list could not be read, so every time is treated as busy.";
    default:
      return "Unrecognised state.";
  }
}

export async function BookingPageHealth({
  links,
}: {
  links: SchedulingLinkRow[];
}) {
  const active = links.filter((l) => l.isActive);
  if (active.length === 0) return null;

  // One row per Builder who has a live link. Probing Google costs a
  // round trip (two when it fails, because the second one force-refreshes
  // to tell a stale token from a dead grant), so it only runs for a
  // Builder whose page is actually reporting trouble. A healthy page
  // costs nothing beyond the columns already read.
  const byBuilder = new Map<string, { name: string; links: SchedulingLinkRow[] }>();
  for (const l of active) {
    const e = byBuilder.get(l.coachUserProfileId) ?? {
      name: l.coachName,
      links: [],
    };
    e.links.push(l);
    byBuilder.set(l.coachUserProfileId, e);
  }

  // Array.from, not a spread: this tsconfig's target rejects iterating a
  // Map iterator directly, and it fails the build rather than lint.
  const rows = await Promise.all(
    Array.from(byBuilder.entries()).map(async ([id, e]) => {
      const troubled = e.links.some((l: SchedulingLinkRow) => l.lastAvailabilityOk === false);
      const diag = await diagnoseGoogleCredentials(id, { probe: troubled });
      return { id, ...e, diag, troubled };
    }),
  );

  const anyTrouble = rows.some(
    (r) => r.troubled || !r.diag.connected || r.diag.probe?.events.ok === false,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-sans text-sm font-bold uppercase tracking-tbb-caps text-tbb-ink-2">
          Are these pages offering times?
        </h2>
        {!anyTrouble && (
          <span className="font-sans text-xs text-tbb-ink-3">
            All good
          </span>
        )}
      </div>

      <div className="space-y-3">
        {rows.map((r) => {
          const bad =
            r.troubled || !r.diag.connected || r.diag.probe?.events.ok === false;
          return (
            <div
              key={r.id}
              className={
                "rounded-md border p-4 space-y-2 " +
                (bad
                  ? "border-tbb-orange-600 bg-tbb-cream-50"
                  : "border-tbb-line bg-white")
              }
            >
              <div className="flex items-center gap-2">
                {bad ? (
                  <AlertTriangle
                    className="w-4 h-4 text-tbb-orange-700 shrink-0"
                    aria-hidden
                  />
                ) : (
                  <CheckCircle2
                    className="w-4 h-4 text-tbb-navy shrink-0"
                    aria-hidden
                  />
                )}
                <span className="font-sans text-sm font-bold text-tbb-navy">
                  {r.name}
                </span>
                <span className="font-mono text-[11px] text-tbb-ink-3">
                  {r.diag.googleEmail ?? "no Google account"}
                </span>
              </div>

              {/* Per-link: the outcome a real visitor got. */}
              <ul className="space-y-1">
                {r.links.map((l: SchedulingLinkRow) => (
                  <li key={l.id} className="font-sans text-xs text-tbb-ink-2">
                    <Link
                      href={`/book/${l.slug}`}
                      className="font-mono underline underline-offset-2"
                    >
                      /book/{l.slug}
                    </Link>{" "}
                    —{" "}
                    {l.lastAvailabilityCheckedAt === null ? (
                      <span className="text-tbb-ink-3">
                        not checked yet; nobody has opened this page since we
                        started recording
                      </span>
                    ) : l.lastAvailabilityOk ? (
                      <span>
                        offering times · last checked {when(l.lastAvailabilityCheckedAt)}
                      </span>
                    ) : (
                      <span className="text-tbb-orange-700 font-bold">
                        showing NO times · {explain(l.lastAvailabilityReason)} ·
                        last checked {when(l.lastAvailabilityCheckedAt)}
                      </span>
                    )}
                    {l.lastAvailabilityError && l.lastAvailabilityOk === false && (
                      <div className="mt-1 font-mono text-[11px] text-tbb-ink-3 break-all">
                        {l.lastAvailabilityError.slice(0, 300)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {!r.diag.connected && (
                <p className="font-sans text-xs text-tbb-orange-700">
                  Google is not connected for {r.name}. Connect it at{" "}
                  <Link
                    href="/business-builder/settings/integrations"
                    className="underline"
                  >
                    Settings → Integrations
                  </Link>
                  .
                </p>
              )}

              {/* Only rendered when something is wrong — a healthy page
                  does not need its credentials picked over. */}
              {r.diag.probe && (
                <div className="rounded border border-tbb-line bg-white p-3 space-y-1">
                  <p className="font-sans text-xs font-bold text-tbb-navy">
                    {r.diag.probe.verdict}
                  </p>
                  {/* The sentence a person acts on. "Reconnect Google" is
                      wrong whenever consent cannot change the outcome —
                      it sends them round a loop that must fail — so it
                      is shown only when it would genuinely help. */}
                  <p className="font-sans text-xs text-tbb-ink-2">
                    {r.diag.probe.reconnectWouldHelp ? (
                      <>
                        <strong>Do this:</strong> reconnect at{" "}
                        <Link
                          href="/business-builder/settings/integrations"
                          className="underline"
                        >
                          Settings → Integrations
                        </Link>{" "}
                        and leave every permission ticked.
                      </>
                    ) : (
                      <>
                        <strong>Do not reconnect</strong> — it would produce
                        the same grant and the same failure. This needs a fix
                        in the app or the Google project.
                      </>
                    )}
                  </p>
                  <dl className="font-mono text-[11px] text-tbb-ink-3 space-y-0.5">
                    <div>
                      stored access token:{" "}
                      {r.diag.accessToken?.storage ?? "missing"}
                      {", "}
                      {r.diag.accessToken?.decrypts
                        ? `decrypts (${r.diag.accessToken.plaintextLength} chars, ${
                            r.diag.accessToken.looksLikeGoogleToken
                              ? "ya29. prefix"
                              : "NOT a ya29. token"
                          })`
                        : `DOES NOT DECRYPT — ${r.diag.accessToken?.decryptError ?? ""}`}
                    </div>
                    <div>
                      stored refresh token:{" "}
                      {r.diag.refreshToken?.storage ?? "missing"}
                      {", "}
                      {r.diag.refreshToken?.decrypts
                        ? `decrypts (${r.diag.refreshToken.plaintextLength} chars, ${
                            r.diag.refreshToken.looksLikeGoogleToken
                              ? "1// prefix"
                              : "NOT a 1// token"
                          })`
                        : `DOES NOT DECRYPT — ${r.diag.refreshToken?.decryptError ?? ""}`}
                    </div>
                    <div>
                      events.list (the call this app makes), stored token:{" "}
                      {r.diag.probe.events.ok
                        ? "accepted"
                        : `refused ${r.diag.probe.events.status ?? ""} ${
                            r.diag.probe.events.message ?? ""
                          }`}
                    </div>
                    {r.diag.probe.eventsAfterForceRefresh && (
                      <div>
                        events.list after forced refresh:{" "}
                        {r.diag.probe.eventsAfterForceRefresh.ok
                          ? "accepted"
                          : `refused ${
                              r.diag.probe.eventsAfterForceRefresh.status ?? ""
                            } ${r.diag.probe.eventsAfterForceRefresh.message ?? ""}`}
                      </div>
                    )}
                    {r.diag.probe.calendarListControl && (
                      <div>
                        calendarList.list (control — this app never calls it;
                        calendar.events does not authorize it, so a 403 here is
                        EXPECTED and is not the fault):{" "}
                        {r.diag.probe.calendarListControl.ok
                          ? "accepted"
                          : `refused ${
                              r.diag.probe.calendarListControl.status ?? ""
                            }`}
                      </div>
                    )}
                    <div>
                      scope on the live token:{" "}
                      {r.diag.probe.liveScope ?? "(tokeninfo unavailable)"}
                    </div>
                    <div>
                      matches the scope we stored at consent:{" "}
                      {r.diag.probe.scopeMatchesStored === undefined
                        ? "unknown"
                        : r.diag.probe.scopeMatchesStored
                          ? "yes"
                          : "NO — the token came from a different grant"}
                    </div>
                    <div>OAuth client (aud): {r.diag.probe.audience ?? "?"}</div>
                  </dl>
                </div>
              )}

              {/* Per-capability, from the stored grant. This is what
                  makes "which permission is missing" a fact rather than
                  an inference from an error string. */}
              {r.diag.capabilities && r.diag.capabilities.length > 0 && (
                <details className="font-sans text-xs text-tbb-ink-3">
                  <summary className="cursor-pointer">
                    Permissions granted at consent
                    {r.diag.missing && r.diag.missing.length > 0
                      ? ` — ${r.diag.missing.length} required one(s) MISSING`
                      : " — all required ones present"}
                  </summary>
                  <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
                    {r.diag.capabilities.map((c) => (
                      <li key={c.key}>
                        {c.granted ? "yes" : c.required ? "MISSING" : "no"} ·{" "}
                        {c.endpoint} · {c.label}
                        {!c.required && " · not needed"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <p className="font-sans text-xs text-tbb-ink-3">
        A page that cannot read its calendar deliberately offers nothing
        rather than risk booking over a client session, so &ldquo;no
        times&rdquo; here means the page is dark, not that the week is full.
      </p>
    </section>
  );
}

export function BookingPageHealthFallback() {
  return (
    <p className="font-sans text-xs text-tbb-ink-3 flex items-center gap-1.5">
      <HelpCircle className="w-3.5 h-3.5" aria-hidden />
      Checking whether these pages are offering times…
    </p>
  );
}
