/**
 * PortalSidebar — left-side vertical navigation for the client portal.
 *
 * Replaces the previous horizontal scrolling top nav. Modules group
 * under engagement-lifecycle phase headers (Today → Conversations →
 * Files → The plan → People → Billing) so the navigation itself
 * reads as a top-down flow through the week.
 *
 * The current page is highlighted; phase headers stay visible whether
 * or not the current section is "open." Clicking any module is a
 * regular link navigation.
 */

import Link from "next/link";
import Image from "next/image";
import { SignOutButton } from "@clerk/nextjs";
import {
  Briefcase,
  CalendarClock,
  CheckSquare,
  CreditCard,
  FileText,
  Folder,
  GraduationCap,
  HeartPulse,
  LineChart,
  MessagesSquare,
  PenSquare,
  Puzzle,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import {
  PORTAL_PHASES,
  type PortalModule,
  type PortalModuleKey,
  type PortalPhase,
} from "@/lib/modules";

const ICON_FOR_MODULE: Record<PortalModuleKey, React.ComponentType<{ className?: string }>> = {
  action_items: CheckSquare,
  sessions: CalendarClock,
  communication: MessagesSquare,
  documents: Folder,
  soul_file: Sparkles,
  goals: LineChart,
  projects: Briefcase,
  deliverables: FileText,
  methodology: ShieldCheck,
  courses: GraduationCap,
  forms: PenSquare,
  team: Users,
  hiring: UserCheck,
  invoices: CreditCard,
  subscriptions: HeartPulse,
  embedded_apps: Puzzle,
};

export function PortalSidebar({
  fullName,
  unreadCount,
  modules,
  engagementName,
}: {
  fullName: string;
  unreadCount: number;
  modules: PortalModule[];
  engagementName?: string | null;
}) {
  // Group modules by phase preserving sort order within each.
  const byPhase = new Map<PortalPhase, PortalModule[]>();
  for (const m of modules) {
    const arr = byPhase.get(m.phase) ?? [];
    arr.push(m);
    byPhase.set(m.phase, arr);
  }

  return (
    <aside className="bg-tbb-navy text-tbb-cream w-64 lg:w-72 sticky top-0 h-screen flex flex-col">
      {/* Header — logo + engagement context */}
      <div className="px-5 pt-6 pb-4 border-b border-tbb-cream/15">
        <Link href="/portal" className="block" aria-label="Business Builder Portal home">
          <Image
            src="/brand/logo-cream.png"
            alt="The Business Builders by Workplaces"
            width={220}
            height={48}
            priority
            className="h-8 w-auto"
          />
        </Link>
        {engagementName && (
          <p className="mt-3 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue-light">
            {engagementName}
          </p>
        )}
      </div>

      {/* Phase-grouped navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {PORTAL_PHASES.map((phase) => {
          const items = byPhase.get(phase.key) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={phase.key} className="space-y-1.5" data-tour={`phase-${phase.key}`}>
              <div className="px-2">
                <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue-light">
                  {phase.label}
                </p>
                <p className="text-[11px] text-tbb-cream/55 leading-snug mt-0.5">
                  {phase.caption}
                </p>
              </div>
              <div className="space-y-0.5">
                {items.map((m) => {
                  const Icon = ICON_FOR_MODULE[m.key] ?? Settings;
                  return (
                    <Link
                      key={m.key}
                      href={m.href}
                      data-tour={`module-${m.key}`}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-bold text-tbb-cream/85 hover:bg-tbb-cream/8 hover:text-tbb-cream transition-colors duration-tbb-base"
                    >
                      <Icon className="w-4 h-4 flex-none" aria-hidden />
                      <span className="truncate">{m.label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>

      {/* Footer — user identity + notifications + sign out */}
      <div className="border-t border-tbb-cream/15 px-3 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-tbb-cream truncate">{fullName}</p>
          <SignOutButton redirectUrl="/">
            <button className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-cream/55 hover:text-tbb-cream transition-colors duration-tbb-base">
              Sign out
            </button>
          </SignOutButton>
        </div>
        <NotificationBell unreadCount={unreadCount} />
      </div>
    </aside>
  );
}
