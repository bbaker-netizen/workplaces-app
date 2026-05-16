/**
 * /coach/profile/google-calendar — Connect / disconnect the user's
 * Google account. The single connection grants:
 *   • Calendar read+write — every BBS session you schedule lands in
 *     your Google Calendar and updates flow both ways.
 *   • Gmail read-only — emails to / from people who are in your CRM
 *     are auto-captured into the client's timeline. Personal email
 *     is ignored.
 *
 * Disconnecting removes the tokens and stops sync.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Calendar, CheckCircle2, AlertTriangle, Mail } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getConnectionStatus } from "@/lib/integrations/google-calendar";
import { googleCalendarTokens } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { DisconnectGoogleCalendarButton } from "@/components/integrations/DisconnectGoogleCalendarButton";
import { GmailSyncControls } from "@/components/integrations/GmailSyncControls";

export default async function GoogleCalendarConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }
  const status = await getConnectionStatus(profile.userProfileId);
  const params = await searchParams;
  const justConnected = params.connected === "1";
  const error = params.error ?? null;

  // Pull Gmail sync state to render on the page.
  const gmailState = status.connected
    ? await withSystemContext(async (tx) => {
        const [row] = await tx
          .select({
            enabled: googleCalendarTokens.gmailSyncEnabled,
            lastSyncedAt: googleCalendarTokens.gmailLastSyncedAt,
            scope: googleCalendarTokens.scope,
          })
          .from(googleCalendarTokens)
          .where(eq(googleCalendarTokens.userProfileId, profile.userProfileId))
          .limit(1);
        return row ?? null;
      })
    : null;
  const hasGmailScope = (gmailState?.scope ?? "").includes("gmail.readonly");

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-1">
        <p className="tbb-eyebrow">Integrations</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Google Workspace
        </h1>
        <p className="text-sm text-tbb-ink-3">
          Sync your sessions to Google Calendar and pull your client emails
          into the CRM automatically. One connection, two integrations.
        </p>
      </header>

      {justConnected && (
        <div className="border border-tbb-success/40 bg-tbb-success/10 text-tbb-success rounded-md px-4 py-3 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>
            Connected. Sessions you schedule will appear in your Google
            Calendar; client emails will start appearing in the Inbox over
            the next 10 minutes.
          </span>
        </div>
      )}

      {error && !justConnected && (
        <div className="border border-tbb-danger/40 bg-tbb-danger/10 text-tbb-danger rounded-md px-4 py-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>
            Couldn&apos;t finish connecting Google:{" "}
            <code className="text-xs">{error}</code>. Try again.
          </span>
        </div>
      )}

      <section className="border border-tbb-line rounded-lg bg-white p-6 shadow-tbb-sm space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar className="w-6 h-6 text-tbb-blue" aria-hidden />
          <div className="flex-1 min-w-[180px]">
            <p className="font-bold text-tbb-navy">
              {status.connected ? "Google account connected" : "Not connected yet"}
            </p>
            {status.connected && status.email && (
              <p className="text-xs text-tbb-ink-3">
                Linked as <span className="font-bold">{status.email}</span>
              </p>
            )}
          </div>
          {status.connected ? (
            <DisconnectGoogleCalendarButton />
          ) : (
            <Link
              href="/api/google-calendar/connect"
              className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
            >
              Connect Google
            </Link>
          )}
        </div>

        <div className="border-t border-tbb-line-soft pt-4 space-y-3 text-sm text-tbb-ink-2">
          <div className="flex items-center gap-2 text-tbb-blue">
            <Calendar className="w-4 h-4" aria-hidden />
            <p className="font-bold">Calendar sync</p>
            <span className="ml-auto text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
              {status.connected ? "Active" : "Off"}
            </span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-tbb-ink-3 text-[13px]">
            <li>
              Every BBS session you schedule appears on your Google Calendar
              with the client name in the title.
            </li>
            <li>
              Edits flow through — change a time here, the Google event
              moves. Cancel here, it disappears there.
            </li>
          </ul>
        </div>

        <div className="border-t border-tbb-line-soft pt-4 space-y-3 text-sm text-tbb-ink-2">
          <div className="flex items-center gap-2 text-tbb-blue">
            <Mail className="w-4 h-4" aria-hidden />
            <p className="font-bold">Gmail capture</p>
            <span className="ml-auto text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
              {!status.connected
                ? "Off"
                : !hasGmailScope
                  ? "Reconnect required"
                  : gmailState?.enabled
                    ? "Active"
                    : "Paused"}
            </span>
          </div>
          {status.connected && !hasGmailScope && (
            <div className="border border-tbb-warning/40 bg-tbb-warning/10 text-tbb-ink-2 rounded-md px-3 py-2 text-[13px]">
              You connected before Gmail capture was added. Click{" "}
              <strong>Reconnect Google</strong> below to grant the extra
              read-only Gmail permission. Your calendar sync is unaffected.
              <div className="mt-2">
                <Link
                  href="/api/google-calendar/connect"
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
                >
                  Reconnect Google
                </Link>
              </div>
            </div>
          )}
          <ul className="list-disc pl-5 space-y-1 text-tbb-ink-3 text-[13px]">
            <li>
              Emails you send to (or receive from) any prospect or client
              whose email is in the CRM land in their timeline automatically.
            </li>
            <li>
              Personal email is ignored — only messages with at least one
              CRM-known participant are touched.
            </li>
            <li>
              Sync runs every 10 minutes in the background. You can also
              trigger it manually below.
            </li>
            <li>
              Disconnect any time to stop sync. Existing captured emails
              stay in the CRM as a historical record.
            </li>
          </ul>
          {status.connected && hasGmailScope && (
            <GmailSyncControls
              enabled={gmailState?.enabled ?? true}
              lastSyncedAt={
                gmailState?.lastSyncedAt
                  ? gmailState.lastSyncedAt.toISOString()
                  : null
              }
            />
          )}
        </div>
      </section>
    </main>
  );
}
