/**
 * /coach/profile/google-calendar — Connect / disconnect the user's
 * Google Calendar. Once connected, every BBS session you schedule
 * lands in your Google Calendar automatically (and edits / cancels
 * propagate too). Disconnecting removes the tokens and the link
 * between this app and your calendar — existing Google events stay.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Calendar, CheckCircle2, AlertTriangle } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getConnectionStatus } from "@/lib/integrations/google-calendar";
import { DisconnectGoogleCalendarButton } from "@/components/integrations/DisconnectGoogleCalendarButton";

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

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-1">
        <p className="tbb-eyebrow">Integrations</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Google Calendar
        </h1>
        <p className="text-sm text-tbb-ink-3">
          Sync the sessions and meetings you schedule in this app into your
          Google Calendar automatically — and see your Google events here
          alongside them.
        </p>
      </header>

      {justConnected && (
        <div className="border border-tbb-success/40 bg-tbb-success/10 text-tbb-success rounded-md px-4 py-3 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>
            Connected. New BBS sessions you schedule will appear in your Google
            Calendar.
          </span>
        </div>
      )}

      {error && !justConnected && (
        <div className="border border-tbb-danger/40 bg-tbb-danger/10 text-tbb-danger rounded-md px-4 py-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span>
            Couldn&apos;t finish connecting Google Calendar:{" "}
            <code className="text-xs">{error}</code>. Try again.
          </span>
        </div>
      )}

      <section className="border border-tbb-line rounded-lg bg-white p-6 shadow-tbb-sm space-y-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-tbb-blue" aria-hidden />
          <div className="flex-1">
            <p className="font-bold text-tbb-navy">
              {status.connected ? "Google Calendar is connected" : "Not connected yet"}
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
              Connect Google Calendar
            </Link>
          )}
        </div>
        <div className="border-t border-tbb-line-soft pt-4 space-y-2 text-sm text-tbb-ink-2">
          <p className="font-bold">What happens when you connect?</p>
          <ul className="list-disc pl-5 space-y-1 text-tbb-ink-3">
            <li>
              Every BBS session you schedule lands in your Google Calendar
              with the client name in the title and the session notes in the
              description.
            </li>
            <li>
              Edits flow through — change a time here, your Google event
              moves. Cancel here, it disappears there.
            </li>
            <li>
              We only request the &quot;Calendar events&quot; permission. We
              cannot read your email, see your contacts, or access any other
              Google data.
            </li>
            <li>
              You can disconnect at any time from this page. Existing events
              already on your Google Calendar stay where they are.
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
