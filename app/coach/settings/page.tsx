/**
 * /coach/settings — Settings hub. Cards link out to each settings
 * sub-page. Add new settings here as they get built.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  CreditCard,
  FileText,
  MailCheck,
  Plug,
  User,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";

type SettingsCard = {
  href: string;
  title: string;
  description: string;
  icon: typeof Building2;
  status?: "ready" | "soon";
  masterAdminOnly?: boolean;
};

const CARDS: SettingsCard[] = [
  {
    href: "/coach/settings/company",
    title: "Company info",
    description:
      "Legal name, business address, tax ID, phone. Fills your side of every contract and invoice.",
    icon: Building2,
    status: "ready",
    masterAdminOnly: true,
  },
  {
    href: "/coach/settings/pricing",
    title: "Pricing tiers",
    description:
      "Default monthly-fee suggestions per program + client size. Drives the {{monthly_fee}} placeholder in your contracts.",
    icon: CreditCard,
    status: "ready",
  },
  {
    href: "/coach/templates",
    title: "Templates & signatures",
    description:
      "Email templates, document templates, your email signature, your e-signature image.",
    icon: FileText,
    status: "ready",
  },
  {
    href: "/coach/inbox",
    title: "Email & SMS connections",
    description:
      "Gmail, Twilio — what's connected, what isn't. Reconnect if anything's drifted.",
    icon: MailCheck,
    status: "soon",
  },
  {
    href: "/coach",
    title: "Profile",
    description:
      "Your name, email, time zone, notification preferences. (Coming soon — currently editable via the Clerk profile menu.)",
    icon: User,
    status: "soon",
  },
  {
    href: "/coach",
    title: "Integrations",
    description:
      "QuickBooks Online, Google Calendar, Fireflies. (Coming soon — each integration's status will appear here.)",
    icon: Plug,
    status: "soon",
  },
];

export default async function SettingsHubPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const isMasterAdmin = profile.role === "master_admin";

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-1">
        <p className="tbb-eyebrow">Settings</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Settings
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Everything that controls how the app behaves — your business
          info, pricing defaults, templates, integrations. Most settings
          you set once and forget about.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        {CARDS.map((c) => {
          const locked = c.masterAdminOnly && !isMasterAdmin;
          const Icon = c.icon;
          const isReady = c.status === "ready" && !locked;
          return (
            <Link
              key={c.href + c.title}
              href={isReady ? c.href : "#"}
              aria-disabled={!isReady}
              className={
                "block p-5 rounded-lg border bg-white space-y-3 transition-shadow " +
                (isReady
                  ? "border-tbb-line shadow-tbb-sm hover:shadow-tbb-md hover:border-tbb-blue cursor-pointer"
                  : "border-tbb-line-soft opacity-60 cursor-not-allowed")
              }
              onClick={(e) => {
                if (!isReady) e.preventDefault();
              }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={
                    "grid place-items-center w-9 h-9 rounded-md " +
                    (isReady ? "bg-tbb-blue-50 text-tbb-blue" : "bg-tbb-cream-50 text-tbb-ink-3")
                  }
                >
                  <Icon className="w-5 h-5" aria-hidden />
                </span>
                <h2 className="font-bold text-tbb-navy text-lg">
                  {c.title}
                </h2>
                {c.status === "soon" && (
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-tbb-caps text-tbb-orange-700 bg-tbb-cream-50 px-1.5 py-0.5 rounded-pill border border-tbb-cream-200">
                    Soon
                  </span>
                )}
                {locked && (
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                    Master admin
                  </span>
                )}
              </div>
              <p className="text-sm text-tbb-ink-2 leading-snug">
                {c.description}
              </p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
