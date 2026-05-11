/**
 * CoachSidebar — left-side vertical navigation for the Coach Console.
 *
 * Visually represents the coaching practice lifecycle top-to-bottom:
 *   PIPELINE → ENGAGE → DELIVER → BILL → PRACTICE
 *
 * A new coach reading this sidebar from top to bottom should see the
 * whole journey of an engagement — from "a prospect just landed" to
 * "we just renewed them for another year." Each section header has a
 * short caption explaining what the phase covers.
 */

import Link from "next/link";
import Image from "next/image";
import { SignOutButton } from "@clerk/nextjs";
import {
  Briefcase,
  CheckSquare,
  CreditCard,
  FileText,
  Filter,
  HelpCircle,
  HeartPulse,
  LineChart,
  Link as LinkIcon,
  MessagesSquare,
  PenSquare,
  Search,
  Settings,
  Sparkles,
  Target,
  UserCheck,
} from "lucide-react";

type CoachNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tourId?: string;
};

type CoachPhase = {
  key: string;
  label: string;
  caption: string;
  items: CoachNavItem[];
};

const COACH_PHASES: CoachPhase[] = [
  {
    key: "pipeline",
    label: "Pipeline",
    caption: "Bring new prospects in",
    items: [
      { href: "/coach/pipeline", label: "Prospects", icon: Filter, tourId: "coach-pipeline" },
      { href: "/diagnostic", label: "Public diagnostic", icon: LinkIcon, tourId: "coach-diagnostic" },
    ],
  },
  {
    key: "engage",
    label: "Engage",
    caption: "Run the rhythm",
    items: [
      { href: "/coach", label: "My work", icon: CheckSquare, tourId: "coach-home" },
      { href: "/coach/action-items", label: "Action items", icon: CheckSquare },
      { href: "/coach/communication", label: "Communication", icon: MessagesSquare },
    ],
  },
  {
    key: "deliver",
    label: "Deliver",
    caption: "Ship the deep work",
    items: [
      { href: "/coach/deliverables", label: "Deliverables", icon: FileText, tourId: "coach-deliverables" },
      { href: "/coach/projects", label: "Projects", icon: Briefcase },
      { href: "/coach/goals", label: "Goals", icon: Target },
      { href: "/coach/hiring", label: "Hiring", icon: UserCheck },
      { href: "/coach/soul-search", label: "Soul File search", icon: Search },
    ],
  },
  {
    key: "bill",
    label: "Bill",
    caption: "Invoice and protect margin",
    items: [
      { href: "/coach/invoices/new", label: "Create invoice", icon: CreditCard, tourId: "coach-invoice" },
      { href: "/coach/subscriptions", label: "Subscriptions", icon: HeartPulse },
    ],
  },
  {
    key: "practice",
    label: "Practice",
    caption: "Your tools and connections",
    items: [
      { href: "/coach/engagements/new", label: "New engagement", icon: Sparkles, tourId: "coach-new-engagement" },
      { href: "/coach/profile/signature", label: "My signature", icon: PenSquare },
      { href: "/coach/profile/quickbooks", label: "QuickBooks", icon: LineChart },
      { href: "/coach/welcome", label: "Coach guide", icon: HelpCircle, tourId: "coach-guide" },
    ],
  },
];

export function CoachSidebar({
  fullName,
  unreadCount,
}: {
  fullName: string;
  unreadCount?: number;
}) {
  return (
    <aside className="bg-tbb-navy text-tbb-cream w-64 lg:w-72 sticky top-0 h-screen flex flex-col">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 border-b border-tbb-cream/15">
        <Link href="/coach" className="block" aria-label="Coach Console home">
          <Image
            src="/brand/logo-cream.png"
            alt="The Business Builders by Workplaces"
            width={220}
            height={48}
            priority
            className="h-8 w-auto"
          />
        </Link>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue-light">
          Coach Console
        </p>
      </div>

      {/* Phase-grouped nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {COACH_PHASES.map((phase, phaseIdx) => (
          <section key={phase.key} className="space-y-1.5" data-tour={`coach-phase-${phase.key}`}>
            <div className="px-2 flex items-baseline gap-2">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue-light tabular-nums">
                {String(phaseIdx + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue-light">
                  {phase.label}
                </p>
                <p className="text-[11px] text-tbb-cream/55 leading-snug mt-0.5">
                  {phase.caption}
                </p>
              </div>
            </div>
            <div className="space-y-0.5 pl-1">
              {phase.items.map((item) => {
                const Icon = item.icon ?? Settings;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-tour={item.tourId}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-bold text-tbb-cream/85 hover:bg-tbb-cream/8 hover:text-tbb-cream transition-colors duration-tbb-base"
                  >
                    <Icon className="w-4 h-4 flex-none" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-tbb-cream/15 px-3 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-tbb-cream truncate">{fullName}</p>
          <div className="flex gap-3 mt-0.5">
            <Link
              href="/portal"
              className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-cream/55 hover:text-tbb-cream transition-colors duration-tbb-base"
            >
              Portal
            </Link>
            <SignOutButton redirectUrl="/">
              <button className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-cream/55 hover:text-tbb-cream transition-colors duration-tbb-base">
                Sign out
              </button>
            </SignOutButton>
          </div>
        </div>
        {typeof unreadCount === "number" && unreadCount > 0 && (
          <span className="bg-tbb-blue text-white text-[10px] font-bold px-2 py-0.5 rounded-pill">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
    </aside>
  );
}
