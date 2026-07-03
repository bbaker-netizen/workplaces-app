/**
 * /business-builder/settings — Settings hub. Cards link out to each settings
 * sub-page. Add new settings here as they get built.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  CreditCard,
  FileText,
  Plug,
  User,
  Users,
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
    href: "/business-builder/settings/company",
    title: "Company info",
    description:
      "Legal name, business address, tax ID, phone. Fills your side of every contract and invoice.",
    icon: Building2,
    status: "ready",
    masterAdminOnly: true,
  },
  {
    href: "/business-builder/settings/pricing",
    title: "Pricing tiers",
    description:
      "Default monthly-fee suggestions per program + client size. Drives the {{monthly_fee}} placeholder in your contracts.",
    icon: CreditCard,
    status: "ready",
    masterAdminOnly: true,
  },
  {
    href: "/business-builder/templates",
    title: "Templates & signatures",
    description:
      "Email templates, document templates, your email signature, your e-signature image.",
    icon: FileText,
    status: "ready",
  },
  {
    href: "/business-builder/settings/team",
    title: "Business Builders",
    description:
      "Invite teammates (like Jen) as standard Business Builders or co-admins, and set who can reach these system settings.",
    icon: Users,
    status: "ready",
    masterAdminOnly: true,
  },
  {
    href: "/business-builder/settings/integrations",
    title: "Integrations & connections",
    description:
      "One place for all connections: your Google (Calendar + Gmail), QuickBooks, and text messaging (SMS) — plus account-wide service status.",
    icon: Plug,
    status: "ready",
  },
  {
    href: "/business-builder/settings/profile",
    title: "Profile",
    description:
      "Your name, email, password, two-factor authentication, email signature, e-signature image. Most fields live in Clerk.",
    icon: User,
    status: "ready",
  },
];

export default async function SettingsHubPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  // Standard Business Builders see the hub but the account-level cards
  // (company, pricing, system integrations, team) are locked to master
  // admins. Personal cards (their own calendar/QuickBooks, profile,
  // templates) stay open.
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
          const cardBody = (
            <>
              <div className="flex items-center gap-2.5">
                <span
                  className={
                    "grid place-items-center w-9 h-9 rounded-md " +
                    (isReady
                      ? "bg-tbb-blue-50 text-tbb-blue"
                      : "bg-tbb-cream-50 text-tbb-ink-3")
                  }
                >
                  <Icon className="w-5 h-5" aria-hidden />
                </span>
                <h2 className="font-bold text-tbb-navy text-lg">{c.title}</h2>
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
            </>
          );
          const sharedClass =
            "block p-5 rounded-lg border bg-white space-y-3 transition-shadow " +
            (isReady
              ? "border-tbb-line shadow-tbb-sm hover:shadow-tbb-md hover:border-tbb-blue cursor-pointer"
              : "border-tbb-line-soft opacity-60 cursor-not-allowed");
          if (isReady) {
            return (
              <Link
                key={c.href + c.title}
                href={c.href}
                className={sharedClass}
              >
                {cardBody}
              </Link>
            );
          }
          return (
            <div
              key={c.href + c.title}
              aria-disabled
              tabIndex={-1}
              className={sharedClass}
            >
              {cardBody}
            </div>
          );
        })}
      </div>
    </main>
  );
}
