"use client";

/**
 * PortalSidebar — left-side vertical navigation for the client portal.
 *
 * Modules group under engagement-lifecycle phase headers so the navigation
 * itself reads as a top-down flow through the week.
 *
 * Phase 5 additions:
 *   • Collapsible to icon-only mode via the chevron at the top.
 *   • Pin favourites — hover any nav item and click the star to pin it.
 *     Pinned items appear in a "Favourites" section at the top of the
 *     sidebar. State follows the user across devices.
 */

import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import {
  Briefcase,
  CalendarClock,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
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
  Star,
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
import {
  setSidebarCollapsed,
  toggleNavPin,
} from "@/lib/actions/user-prefs";

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
  pinnedNavItems,
  collapsedInitial,
  isCoach,
}: {
  fullName: string;
  unreadCount: number;
  modules: PortalModule[];
  engagementName?: string | null;
  pinnedNavItems: string[];
  collapsedInitial: boolean;
  isCoach: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(collapsedInitial);
  const [pins, setPins] = useState<string[]>(pinnedNavItems);
  const [, startTransition] = useTransition();

  function isActiveHref(href: string): boolean {
    if (href === "/portal") return pathname === "/portal";
    return pathname === href || pathname.startsWith(href + "/");
  }

  function onToggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    startTransition(() => {
      setSidebarCollapsed(next);
    });
  }

  function onTogglePin(href: string) {
    setPins((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href],
    );
    startTransition(async () => {
      await toggleNavPin(href);
      router.refresh();
    });
  }

  // Group modules by phase preserving sort order within each.
  const byPhase = new Map<PortalPhase, PortalModule[]>();
  for (const m of modules) {
    const arr = byPhase.get(m.phase) ?? [];
    arr.push(m);
    byPhase.set(m.phase, arr);
  }

  const allModulesByHref = new Map<string, PortalModule>();
  for (const m of modules) allModulesByHref.set(m.href, m);
  const pinnedModules = pins
    .map((href) => allModulesByHref.get(href))
    .filter((m): m is PortalModule => Boolean(m));

  return (
    <aside
      className={
        "bg-tbb-navy text-tbb-cream sticky top-0 h-screen flex flex-col transition-all duration-tbb-base " +
        (collapsed ? "w-16" : "w-64 lg:w-72")
      }
    >
      {/* Header */}
      <div
        className={
          "border-b border-tbb-cream/15 " +
          (collapsed ? "px-2 py-3" : "px-5 pt-6 pb-4")
        }
      >
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/portal"
            className="block"
            aria-label="Business Builder Portal home"
          >
            {collapsed ? (
              <span className="grid place-items-center w-10 h-10 rounded-md bg-tbb-blue text-white font-bold text-sm">
                B
              </span>
            ) : (
              <Image
                src="/brand/logo-cream.png"
                alt="The Business Builders by Workplaces"
                width={220}
                height={48}
                priority
                className="h-8 w-auto"
              />
            )}
          </Link>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="shrink-0 grid place-items-center w-7 h-7 rounded-md text-tbb-cream/70 hover:bg-tbb-cream/8 hover:text-tbb-cream transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" aria-hidden />
            ) : (
              <ChevronLeft className="w-4 h-4" aria-hidden />
            )}
          </button>
        </div>
        {!collapsed && engagementName && (
          <p className="mt-3 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue-light">
            {engagementName}
          </p>
        )}
      </div>

      {/* Nav */}
      <nav
        className={
          "flex-1 overflow-y-auto " +
          (collapsed ? "px-1.5 py-3 space-y-3" : "px-3 py-4 space-y-5")
        }
      >
        {pinnedModules.length > 0 && (
          <section className={collapsed ? "space-y-1" : "space-y-1.5"}>
            {!collapsed && (
              <div className="px-2 flex items-center gap-1.5">
                <Star className="w-3 h-3 text-tbb-warning" aria-hidden />
                <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-warning">
                  Favourites
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              {pinnedModules.map((m) => (
                <ModuleRow
                  key={"fav-" + m.href}
                  module={m}
                  collapsed={collapsed}
                  isPinned
                  isActive={isActiveHref(m.href)}
                  onTogglePin={onTogglePin}
                />
              ))}
            </div>
          </section>
        )}

        {PORTAL_PHASES.map((phase) => {
          const items = byPhase.get(phase.key) ?? [];
          if (items.length === 0) return null;
          return (
            <section
              key={phase.key}
              className={collapsed ? "space-y-1" : "space-y-1.5"}
              data-tour={`phase-${phase.key}`}
            >
              {!collapsed ? (
                <div className="px-2">
                  <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue-light">
                    {phase.label}
                  </p>
                  <p className="text-[11px] text-tbb-cream/55 leading-snug mt-0.5">
                    {phase.caption}
                  </p>
                </div>
              ) : (
                <div className="h-px bg-tbb-cream/10 mx-2" />
              )}
              <div className="space-y-0.5">
                {items.map((m) => (
                  <ModuleRow
                    key={m.key}
                    module={m}
                    collapsed={collapsed}
                    isPinned={pins.includes(m.href)}
                    isActive={isActiveHref(m.href)}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className={
          "border-t border-tbb-cream/15 flex items-center justify-between gap-2 " +
          (collapsed ? "px-2 py-3 flex-col" : "px-3 py-3")
        }
      >
        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-tbb-cream truncate">
                {fullName}
              </p>
              <div className="flex gap-3 mt-0.5">
                {isCoach && (
                  <Link
                    href="/business-builder"
                    className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-cream/55 hover:text-tbb-cream transition-colors duration-tbb-base"
                  >
                    Console
                  </Link>
                )}
                <SignOutButton redirectUrl="/">
                  <button className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-cream/55 hover:text-tbb-cream transition-colors duration-tbb-base">
                    Sign out
                  </button>
                </SignOutButton>
              </div>
            </div>
            <NotificationBell unreadCount={unreadCount} />
          </>
        ) : (
          <NotificationBell unreadCount={unreadCount} />
        )}
      </div>
    </aside>
  );
}

function ModuleRow({
  module,
  collapsed,
  isPinned,
  isActive,
  onTogglePin,
}: {
  module: PortalModule;
  collapsed: boolean;
  isPinned: boolean;
  isActive: boolean;
  onTogglePin: (href: string) => void;
}) {
  const Icon = ICON_FOR_MODULE[module.key] ?? Settings;

  if (collapsed) {
    return (
      <Link
        href={module.href}
        data-tour={`module-${module.key}`}
        title={module.label}
        aria-label={module.label}
        aria-current={isActive ? "page" : undefined}
        className={
          "grid place-items-center w-10 h-10 mx-auto rounded-md transition-colors duration-tbb-base " +
          (isActive
            ? "bg-tbb-blue text-white shadow-tbb-sm"
            : "text-tbb-cream/85 hover:bg-tbb-cream/8 hover:text-tbb-cream")
        }
      >
        <Icon className="w-4 h-4" aria-hidden />
      </Link>
    );
  }

  return (
    <div className="group relative flex items-center">
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-tbb-warning"
        />
      )}
      <Link
        href={module.href}
        data-tour={`module-${module.key}`}
        aria-current={isActive ? "page" : undefined}
        className={
          "flex-1 flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-md text-sm font-bold transition-colors duration-tbb-base " +
          (isActive
            ? "bg-tbb-cream/15 text-tbb-cream"
            : "text-tbb-cream/85 hover:bg-tbb-cream/8 hover:text-tbb-cream")
        }
      >
        <Icon className="w-4 h-4 flex-none" aria-hidden />
        <span className="truncate">{module.label}</span>
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTogglePin(module.href);
        }}
        aria-label={isPinned ? `Unpin ${module.label}` : `Pin ${module.label}`}
        title={isPinned ? "Unpin from favourites" : "Pin to favourites"}
        className={
          "absolute right-1.5 grid place-items-center w-6 h-6 rounded-md transition-opacity " +
          (isPinned
            ? "opacity-100 text-tbb-warning hover:bg-tbb-cream/8"
            : "opacity-0 group-hover:opacity-100 text-tbb-cream/55 hover:bg-tbb-cream/8 hover:text-tbb-warning")
        }
      >
        <Star
          className="w-3.5 h-3.5"
          aria-hidden
          fill={isPinned ? "currentColor" : "none"}
        />
      </button>
    </div>
  );
}
