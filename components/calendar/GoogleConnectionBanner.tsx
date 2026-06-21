/**
 * Persistent Google Calendar connection status for the Business Builder
 * calendar. Makes a silently-dead connection visible at a glance instead
 * of the coach discovering "nothing synced" weeks later. Three states:
 *
 *   - not-connected  → neutral prompt to connect
 *   - needs-reconnect → loud orange alert (Google access expired)
 *   - connected      → quiet confirmation with the connected account
 *
 * Purely presentational; the health probe runs in the page (server side).
 */

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Link2 } from "lucide-react";
import type { CalendarConnectionHealth } from "@/lib/integrations/google-calendar";

const CONNECT_HREF = "/business-builder/profile/google-calendar";

function formatConnectedAt(d: Date | null): string | null {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Edmonton",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return null;
  }
}

export function GoogleConnectionBanner({
  health,
}: {
  health: CalendarConnectionHealth;
}) {
  if (health.state === "needs-reconnect") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-tbb-orange bg-tbb-orange/10 px-4 py-3">
        <AlertTriangle
          className="w-5 h-5 text-tbb-orange shrink-0 mt-0.5"
          aria-hidden
        />
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-tbb-navy">
            Google Calendar access expired — sessions aren&apos;t syncing
          </p>
          <p className="text-sm text-tbb-ink-3">
            {health.email ? (
              <>
                The connection for{" "}
                <span className="font-medium">{health.email}</span> needs to be
                re-authorized.{" "}
              </>
            ) : (
              "Your Google connection needs to be re-authorized. "
            )}
            <Link
              href={CONNECT_HREF}
              className="font-bold text-tbb-orange hover:underline"
            >
              Reconnect Google →
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (health.state === "not-connected") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-tbb-line bg-white px-4 py-3">
        <Link2 className="w-5 h-5 text-tbb-ink-3 shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-tbb-navy">
            Google Calendar isn&apos;t connected
          </p>
          <p className="text-sm text-tbb-ink-3">
            Connect it once and your sessions sync automatically.{" "}
            <Link
              href={CONNECT_HREF}
              className="font-bold text-tbb-blue hover:underline"
            >
              Connect Google →
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const connectedAt = formatConnectedAt(health.connectedAt);
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-tbb-line bg-white px-4 py-2.5">
      <CheckCircle2 className="w-4 h-4 text-tbb-success shrink-0" aria-hidden />
      <p className="text-sm text-tbb-ink-3">
        Google Calendar connected
        {health.email ? (
          <>
            {" as "}
            <span className="font-medium text-tbb-navy">{health.email}</span>
          </>
        ) : null}
        . Sessions sync automatically.
        {connectedAt ? (
          <span className="text-tbb-ink-4"> Connected since {connectedAt}.</span>
        ) : null}
      </p>
    </div>
  );
}
