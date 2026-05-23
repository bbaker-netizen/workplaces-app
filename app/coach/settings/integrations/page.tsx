/**
 * /coach/settings/integrations — landing for every outside service
 * The Builder talks to. Each integration shows its current status
 * (Connected / Not connected / Configured-via-env) and a link to
 * the existing manage page where you connect or disconnect it.
 *
 * Rather than build a separate config page per integration here,
 * we link out to the existing surfaces under /coach/profile/* and
 * surface the connection state in one place.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  CircleSlash,
  FileText,
  Hammer,
  MessageSquare,
  Receipt,
  Sparkles,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { googleCalendarTokens, qboOauthTokens } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { isSmsConfigured } from "@/lib/integrations/twilio";
import { isNetlifyConfigured } from "@/lib/integrations/netlify";

type Status = "connected" | "not_connected" | "env_configured" | "missing";

type Integration = {
  key: string;
  title: string;
  blurb: string;
  icon: typeof Calendar;
  status: Status;
  detail?: string;
  manageHref: string;
  manageLabel: string;
};

function StatusPill({ status }: { status: Status }) {
  if (status === "connected" || status === "env_configured") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-success bg-white border border-tbb-success/30 px-2 py-0.5 rounded-pill">
        <CheckCircle2 className="w-3 h-3" aria-hidden />
        {status === "connected" ? "Connected" : "Configured"}
      </span>
    );
  }
  if (status === "not_connected") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 bg-white border border-tbb-line px-2 py-0.5 rounded-pill">
        <CircleSlash className="w-3 h-3" aria-hidden />
        Not connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-orange-700 bg-tbb-cream-50 border border-tbb-cream-200 px-2 py-0.5 rounded-pill">
      <CircleSlash className="w-3 h-3" aria-hidden />
      Missing keys
    </span>
  );
}

export default async function IntegrationsHubPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  // Load connection state for each integration in parallel.
  const netlifyOk = isNetlifyConfigured();
  const [googleCount, qboCount, smsOk] = await Promise.all([
    withSystemContext(async (tx) => {
      const rows = await tx
        .select({ id: googleCalendarTokens.userProfileId })
        .from(googleCalendarTokens)
        .where(eq(googleCalendarTokens.userProfileId, profile.userProfileId))
        .limit(1);
      return rows.length;
    }).catch(() => 0),
    withSystemContext(async (tx) => {
      const rows = await tx
        .select({ id: qboOauthTokens.coachUserProfileId })
        .from(qboOauthTokens)
        .where(eq(qboOauthTokens.coachUserProfileId, profile.userProfileId))
        .limit(1);
      return rows.length;
    }).catch(() => 0),
    Promise.resolve(isSmsConfigured()),
  ]);

  const integrations: Integration[] = [
    {
      key: "google",
      title: "Google Calendar + Gmail",
      blurb:
        "Schedules sessions to your calendar both ways and auto-captures client emails into the timeline.",
      icon: Calendar,
      status: googleCount > 0 ? "connected" : "not_connected",
      manageHref: "/coach/profile/google-calendar",
      manageLabel: googleCount > 0 ? "Manage" : "Connect",
    },
    {
      key: "qbo",
      title: "QuickBooks Online",
      blurb:
        "Invoices client engagements straight to QBO. Customer + product sync, payment status updates.",
      icon: Receipt,
      status: qboCount > 0 ? "connected" : "not_connected",
      manageHref: "/coach/profile/quickbooks",
      manageLabel: qboCount > 0 ? "Manage" : "Connect",
    },
    {
      key: "twilio",
      title: "Twilio (SMS)",
      blurb:
        "Sends SMS from the prospect / engagement communication panel. Configured via TWILIO_* environment variables.",
      icon: MessageSquare,
      status: smsOk ? "env_configured" : "missing",
      detail: smsOk
        ? "TWILIO_* env vars detected. Sends go through your configured number."
        : "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER on Netlify to enable SMS.",
      manageHref: "https://app.netlify.com/projects/workplaces-the-builder/configuration/env",
      manageLabel: "Netlify env vars ↗",
    },
    {
      key: "netlify",
      title: "Netlify (deployed apps)",
      blurb:
        "Pulls every site in your Netlify account into the Tools & tutorials library. One click in the library syncs your whole catalogue.",
      icon: Hammer,
      status: netlifyOk ? "env_configured" : "missing",
      detail: netlifyOk
        ? "NETLIFY_PERSONAL_ACCESS_TOKEN detected. Head to Tools & tutorials → Sync from Netlify to import your sites."
        : "Generate a token at https://app.netlify.com/user/applications#personal-access-tokens, then add NETLIFY_PERSONAL_ACCESS_TOKEN on this site's env vars.",
      manageHref: "https://app.netlify.com/projects/workplaces-the-builder/configuration/env",
      manageLabel: "Netlify env vars ↗",
    },
    {
      key: "fireflies",
      title: "Fireflies (meeting transcripts)",
      blurb:
        "Pulls meeting transcripts when seeding a new client's Soul File. Configured via FIREFLIES_API_KEY.",
      icon: Sparkles,
      status: process.env.FIREFLIES_API_KEY ? "env_configured" : "missing",
      detail: process.env.FIREFLIES_API_KEY
        ? "FIREFLIES_API_KEY detected. Soul File seeding will pull recent transcripts."
        : "Set FIREFLIES_API_KEY on Netlify to enable transcript ingestion.",
      manageHref: "https://app.netlify.com/projects/workplaces-the-builder/configuration/env",
      manageLabel: "Netlify env vars ↗",
    },
    {
      key: "resend",
      title: "Resend (transactional email)",
      blurb:
        "Sends all branded transactional email — invitations, welcome emails, signing requests, reminders.",
      icon: FileText,
      status: process.env.RESEND_API_KEY ? "env_configured" : "missing",
      manageHref: "https://app.netlify.com/projects/workplaces-the-builder/configuration/env",
      manageLabel: "Netlify env vars ↗",
    },
  ];

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/coach/settings"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Settings
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Integrations &amp; connections
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Outside services The Builder hooks into. OAuth connections you
          manage per-user; everything else is configured via Netlify
          environment variables (server-side keys).
        </p>
      </header>

      <ul className="space-y-3">
        {integrations.map((it) => {
          const Icon = it.icon;
          const external = it.manageHref.startsWith("http");
          return (
            <li
              key={it.key}
              className="flex items-start gap-4 p-5 rounded-lg border border-tbb-line bg-white shadow-tbb-sm"
            >
              <span className="grid place-items-center w-10 h-10 rounded-md bg-tbb-blue-50 text-tbb-blue shrink-0">
                <Icon className="w-5 h-5" aria-hidden />
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-tbb-navy text-base">
                    {it.title}
                  </h2>
                  <StatusPill status={it.status} />
                </div>
                <p className="text-sm text-tbb-ink-2 leading-snug">{it.blurb}</p>
                {it.detail && (
                  <p className="text-[11px] text-tbb-ink-3 leading-snug">
                    {it.detail}
                  </p>
                )}
              </div>
              <Link
                href={it.manageHref}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue shrink-0"
              >
                {it.manageLabel}
                {!external && <ArrowRight className="w-3.5 h-3.5" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
