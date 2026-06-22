"use client";

/**
 * BusinessBuilderSidebar — left-side vertical navigation for the Business Builder Console.
 *
 * Visually represents the Business Building practice lifecycle top-to-bottom:
 *   PIPELINE → ENGAGE → DELIVER → BILL → PRACTICE
 *
 * Phase 5 additions:
 *   • Collapsible to icon-only mode via the chevron at the top — saves screen
 *     space when you're working in a wide module like the Pipeline table.
 *   • Pin favourites — hover any nav item and click the star to pin it to a
 *     "Favourites" section at the top of the sidebar. State follows the user
 *     across devices (persisted on user_profiles).
 */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isConsoleModuleVisible } from "@/lib/console-modules";
import { SignOutButton } from "@clerk/nextjs";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Eye,
  FileText,
  Filter,
  HelpCircle,
  Hammer,
  Inbox,
  LogOut,
  MessagesSquare,
  PenLine,
  Rocket,
  Settings,
  Sparkles,
  Star,
  Workflow,
} from "lucide-react";
import {
  setSidebarCollapsed,
  toggleNavPin,
} from "@/lib/actions/user-prefs";
import type { BusinessBuilderPulse } from "@/lib/db/queries/business-builder-pulse";

// Per-phase open/closed state lives in localStorage so it persists
// across reloads without a DB round-trip. Closed-by-default keeps
// the sidebar quiet until you click into a section.
// v2: bumped from v1 so old auto-opened state from the previous
// build (which auto-opened the section containing the current page)
// gets discarded — fresh deploy starts everyone all-closed.
const PHASES_STORAGE_KEY = "tbb.sidebarPhasesOpen.v2";

type BusinessBuilderNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tourId?: string;
  /** Open in a new tab. Use for client-facing surfaces (e.g. the
   *  public diagnostic) so the Business Builder doesn't get trapped
   *  on a page with no nav back to the console. */
  external?: boolean;
  /** Only show this item to master admins. Standard Business Builders
   *  (coach role) don't see system-settings entries. */
  masterAdminOnly?: boolean;
};

type BusinessBuilderPhase = {
  key: string;
  label: string;
  caption: string;
  /** Icon rendered alongside the section label so the section header
   *  is recognisable at a glance — bigger and more "menu-like". */
  icon: React.ComponentType<{ className?: string }>;
  items: BusinessBuilderNavItem[];
};

const BUSINESS_BUILDER_PHASES: BusinessBuilderPhase[] = [
  {
    key: "pipeline",
    label: "Pipeline",
    caption: "Bring new prospects in",
    icon: Filter,
    items: [
      { href: "/business-builder/pipeline", label: "Prospects & Clients", icon: Filter, tourId: "Coach-pipeline" },
    ],
  },
  {
    key: "engage",
    label: "Engage",
    caption: "Run the rhythm",
    icon: Rocket,
    items: [
      { href: "/business-builder", label: "My work", icon: CheckSquare, tourId: "Coach-home" },
      { href: "/business-builder/engagements", label: "Client Portal", icon: Briefcase },
      { href: "/business-builder/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/business-builder/action-items", label: "Action items", icon: CheckSquare },
      { href: "/business-builder/inbox", label: "Inbox (email / SMS / calls)", icon: Inbox },
      { href: "/business-builder/communication", label: "Communication", icon: MessagesSquare },
    ],
  },
  {
    key: "deliver",
    label: "Deliver",
    caption: "Ship the deep work",
    icon: Workflow,
    items: [
      { href: "/business-builder/deliverables", label: "Deliverables", icon: FileText, tourId: "Coach-deliverables" },
      { href: "/business-builder/projects", label: "Projects", icon: Briefcase },
      // Goals removed per Bruce — was redundant with Projects in practice.
      // Soul File removed per Bruce — the concept is retired across the app.
    ],
  },
  {
    key: "tools",
    label: "Tools",
    caption: "Templates, library, settings",
    icon: Hammer,
    items: [
      // QBO + Google Calendar links live in Settings → Integrations
      // now — Bruce flagged the duplication, removed from here.
      // "New engagement" link removed — you start a client from their
      // prospect's "Convert to engagement" button (one obvious path).
      { href: "/business-builder/templates", label: "Templates & signatures", icon: FileText },
      { href: "/business-builder/library", label: "Client tools & tutorials", icon: Sparkles },
      { href: "/business-builder/settings", label: "Settings", icon: Settings },
      { href: "/business-builder/welcome", label: "Business Builder guide", icon: HelpCircle, tourId: "Coach-guide" },
    ],
  },
];

// Flat lookup of all items by href for the Favourites resolver.
const ALL_ITEMS_BY_HREF = new Map<string, BusinessBuilderNavItem>();
for (const phase of BUSINESS_BUILDER_PHASES) {
  for (const item of phase.items) ALL_ITEMS_BY_HREF.set(item.href, item);
}

export function BusinessBuilderSidebar({
  fullName,
  isMasterAdmin = false,
  allowedConsoleModules = null,
  unreadCount,
  pinnedNavItems,
  collapsedInitial,
  pulse,
}: {
  fullName: string;
  /** Master admins see system-settings nav entries; standard Business
   *  Builders (coach role) don't. */
  isMasterAdmin?: boolean;
  /** Console module hrefs this Business Builder may use; null = all. Set
   *  by a master_admin via the Team access page. */
  allowedConsoleModules?: string[] | null;
  unreadCount?: number;
  pinnedNavItems: string[];
  collapsedInitial: boolean;
  pulse?: BusinessBuilderPulse;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(collapsedInitial);
  const [pins, setPins] = useState<string[]>(pinnedNavItems);
  const [, startTransition] = useTransition();

  // Keep the menu's scroll position across navigations — clicking an item
  // used to jump the nav back to the top. Persist in sessionStorage (so it
  // survives a remount) and restore on the next frame (so it beats any
  // post-navigation scroll reset).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const onScroll = () => {
      try {
        sessionStorage.setItem("bb-nav-scroll", String(nav.scrollTop));
      } catch {
        /* ignore */
      }
    };
    nav.addEventListener("scroll", onScroll, { passive: true });
    return () => nav.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const raf = requestAnimationFrame(() => {
      try {
        const s = sessionStorage.getItem("bb-nav-scroll");
        if (s != null) nav.scrollTop = parseInt(s, 10) || 0;
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  // Per-phase open/closed state. Defaults to ALL CLOSED so the sidebar
  // is quiet until you click into a section. Persists in localStorage
  // so the choice survives reloads / navigations.
  //
  // Lazy initializer reads localStorage on the very first render
  // (client-side only). Server-side renders all-closed, then client
  // hydration applies the saved state immediately — no flash on
  // navigation between sub-pages.
  const [openPhases, setOpenPhases] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(PHASES_STORAGE_KEY);
      const stored: string[] = raw ? JSON.parse(raw) : [];
      return new Set<string>(stored);
    } catch {
      return new Set();
    }
  });

  // Also re-read on mount as a belt-and-suspenders in case the lazy
  // initializer ran before localStorage was ready (rare).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PHASES_STORAGE_KEY);
      const stored: string[] = raw ? JSON.parse(raw) : [];
      setOpenPhases((prev) => {
        const next = new Set<string>(stored);
        if (
          prev.size === next.size &&
          Array.from(prev).every((k) => next.has(k))
        ) {
          return prev; // no change, avoid re-render
        }
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  function togglePhase(key: string) {
    setOpenPhases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(
          PHASES_STORAGE_KEY,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // silently ignore
      }
      return next;
    });
  }

  /** True when this nav item's href corresponds to the current page.
   *  Exact match for the /business-builder root; prefix match for deeper routes
   *  so /business-builder/pipeline/[id] still marks the Prospects link active. */
  function isActiveHref(href: string): boolean {
    if (href === "/business-builder") return pathname === "/business-builder";
    if (href === "/diagnostic") return false; // external preview link
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

  // Hide master-admin-only entries from standard Business Builders, and
  // hide any console module a master_admin hasn't granted this Builder.
  const canSee = (it: BusinessBuilderNavItem) =>
    isMasterAdmin ||
    (!it.masterAdminOnly &&
      isConsoleModuleVisible(it.href, allowedConsoleModules));

  const visiblePhases = useMemo(
    () =>
      BUSINESS_BUILDER_PHASES.map((p) => ({
        ...p,
        items: p.items.filter(canSee),
      })).filter((p) => p.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMasterAdmin, allowedConsoleModules],
  );

  const pinnedItems = pins
    .map((href) => ALL_ITEMS_BY_HREF.get(href))
    .filter((it): it is BusinessBuilderNavItem => Boolean(it))
    .filter(canSee);

  return (
    <aside
      className={
        "bg-tbb-navy text-white sticky top-0 h-screen flex flex-col transition-all duration-tbb-base " +
        (collapsed ? "w-16" : "w-64 lg:w-72")
      }
    >
      {/* Header — logo + collapse toggle */}
      <div
        className={
          "border-b border-tbb-cream/15 " +
          (collapsed ? "px-2 py-3" : "px-5 pt-6 pb-4")
        }
      >
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/business-builder"
            className="block"
            aria-label="Business Builder Console home"
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
            className="shrink-0 grid place-items-center w-7 h-7 rounded-md text-white/85 hover:bg-tbb-cream/8 hover:text-white transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" aria-hidden />
            ) : (
              <ChevronLeft className="w-4 h-4" aria-hidden />
            )}
          </button>
        </div>
        {!collapsed && (
          <p className="mt-3 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue-light">
            Business Builder Console
          </p>
        )}
      </div>

      {/* Nav */}
      <nav
        ref={navRef}
        className={
          "flex-1 overflow-y-auto " + (collapsed ? "px-1.5 py-3 space-y-3" : "px-3 py-4 space-y-5")
        }
      >
        {/* Favourites — top section, only when pins exist. */}
        {pinnedItems.length > 0 && (
          <section className={collapsed ? "space-y-1" : "space-y-1.5"}>
            {!collapsed && (
              <div className="px-2 flex items-center gap-1.5">
                <Star className="w-3 h-3 text-tbb-warning" aria-hidden />
                <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-warning">
                  Favourites
                </p>
              </div>
            )}
            <div className={collapsed ? "space-y-0.5" : "space-y-0.5 pl-1"}>
              {pinnedItems.map((item) => (
                <NavItemRow
                  key={"fav-" + item.href}
                  item={item}
                  collapsed={collapsed}
                  isPinned
                  isActive={isActiveHref(item.href)}
                  onTogglePin={onTogglePin}
                />
              ))}
            </div>
          </section>
        )}

        {visiblePhases.map((phase) => {
          const PhaseIcon = phase.icon;
          const isOpen = openPhases.has(phase.key);
          const hasActiveChild = phase.items.some((it) =>
            isActiveHref(it.href),
          );
          // Collapsed (icon-only) sidebar mode renders sections as
          // flat icon stacks — no expand/collapse needed there.
          if (collapsed) {
            return (
              <section
                key={phase.key}
                className="space-y-1"
                data-tour={`Coach-phase-${phase.key}`}
              >
                <div
                  className={
                    "grid place-items-center py-1.5 rounded-md " +
                    (hasActiveChild
                      ? "text-tbb-blue-light"
                      : "text-tbb-blue-light/50")
                  }
                  title={phase.label}
                >
                  <PhaseIcon className="w-4 h-4" aria-hidden />
                </div>
                <div className="space-y-0.5">
                  {phase.items.map((item) => (
                    <NavItemRow
                      key={item.href}
                      item={item}
                      collapsed={collapsed}
                      isPinned={pins.includes(item.href)}
                      isActive={isActiveHref(item.href)}
                      onTogglePin={onTogglePin}
                    />
                  ))}
                </div>
              </section>
            );
          }
          // Expanded mode: open state is *only* the user's explicit
          // choice (persisted in localStorage). No auto-open from
          // the URL — Bruce's rule: closed by default, opens only
          // when the user clicks the header. hasActiveChild still
          // colours the icon tile so the user can see "I'm currently
          // inside this section" even when it's collapsed.
          return (
            <section
              key={phase.key}
              className="space-y-1"
              data-tour={`Coach-phase-${phase.key}`}
            >
              <button
                type="button"
                onClick={() => togglePhase(phase.key)}
                aria-expanded={isOpen}
                aria-controls={`phase-items-${phase.key}`}
                className={
                  "w-full flex items-center gap-3 px-2.5 py-2 rounded-md transition-colors group " +
                  (isOpen
                    ? "bg-tbb-cream/8 text-white"
                    : "text-white/90 hover:bg-tbb-cream/5 hover:text-white")
                }
              >
                <span
                  className={
                    "grid place-items-center w-8 h-8 rounded-md shrink-0 transition-colors relative " +
                    (hasActiveChild
                      ? "bg-tbb-blue text-white"
                      : "bg-tbb-cream/10 text-tbb-blue-light group-hover:bg-tbb-cream/15")
                  }
                  aria-hidden
                >
                  <PhaseIcon className="w-4 h-4" />
                  {hasActiveChild && !isOpen && (
                    <span
                      className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-tbb-orange border border-tbb-navy"
                      title="Current page is in here"
                    />
                  )}
                </span>
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-sm font-bold text-white tracking-tight">
                    {phase.label}
                  </span>
                  <span className="block text-[11px] text-white/65 leading-snug">
                    {phase.caption}
                  </span>
                </span>
                <ChevronDown
                  className={
                    "w-4 h-4 text-white/60 shrink-0 transition-transform " +
                    (isOpen ? "rotate-180" : "")
                  }
                  aria-hidden
                />
              </button>
              {isOpen && (
                <div
                  id={`phase-items-${phase.key}`}
                  className="space-y-0.5 pl-3 pt-0.5"
                >
                  {phase.items.map((item) => (
                    <NavItemRow
                      key={item.href}
                      item={item}
                      collapsed={collapsed}
                      isPinned={pins.includes(item.href)}
                      isActive={isActiveHref(item.href)}
                      onTogglePin={onTogglePin}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </nav>

      {/* Today's pulse — fills the space below the section list with
          the three numbers Bruce reads at-a-glance every time he
          opens the app. Hidden in collapsed mode where there's no
          room for it. */}
      {!collapsed && pulse && <TodayPulse pulse={pulse} />}

      {/* Footer */}
      <div
        className={
          "border-t border-tbb-cream/15 flex items-center justify-between gap-2 " +
          (collapsed ? "px-2 py-3 flex-col" : "px-3 py-3")
        }
      >
        {!collapsed && (
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[11px] font-bold text-white truncate">{fullName}</p>
            {/* Client Portal View — pill-styled preview action, visually
                distinct from the destructive Sign Out below. */}
            <a
              href="/portal/preview"
              title="Preview the client portal as your client would see it"
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tbb-caps px-2.5 py-1 rounded-pill bg-tbb-cream/10 text-white/90 hover:bg-tbb-cream/20 hover:text-white transition-colors duration-tbb-base border border-tbb-cream/15"
            >
              <Eye className="w-3 h-3" aria-hidden />
              Client Portal View
            </a>
            <div>
              <SignOutButton redirectUrl="/">
                <button
                  data-tbb-async="true"
                  data-tbb-async-label="Signing out…"
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tbb-caps text-white/70 hover:text-tbb-danger transition-colors duration-tbb-base"
                >
                  <LogOut className="w-3 h-3" aria-hidden />
                  Sign out
                </button>
              </SignOutButton>
            </div>
          </div>
        )}
        {collapsed && (
          <SignOutButton redirectUrl="/">
            <button
              type="button"
              data-tbb-async="true"
              data-tbb-async-label="Signing out…"
              aria-label={`Sign out (${fullName})`}
              title={`Sign out (${fullName})`}
              className="grid place-items-center w-9 h-9 rounded-md text-white/85 hover:bg-tbb-cream/8 hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4" aria-hidden />
            </button>
          </SignOutButton>
        )}
        {typeof unreadCount === "number" && unreadCount > 0 && !collapsed && (
          <span className="bg-tbb-blue text-white text-[10px] font-bold px-2 py-0.5 rounded-pill">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
    </aside>
  );
}

function NavItemRow({
  item,
  collapsed,
  isPinned,
  isActive,
  onTogglePin,
}: {
  item: BusinessBuilderNavItem;
  collapsed: boolean;
  isPinned: boolean;
  isActive: boolean;
  onTogglePin: (href: string) => void;
}) {
  const Icon = item.icon ?? Settings;

  const linkExtras = item.external
    ? { target: "_blank", rel: "noreferrer noopener" }
    : {};

  if (collapsed) {
    return (
      <Link
        href={item.href}
        data-tour={item.tourId}
        title={item.label}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        {...linkExtras}
        className={
          "grid place-items-center w-10 h-10 mx-auto rounded-md transition-colors duration-tbb-base " +
          (isActive
            ? "bg-tbb-blue text-white shadow-tbb-sm"
            : "text-white/95 hover:bg-tbb-cream/8 hover:text-white")
        }
      >
        <Icon className="w-4 h-4" aria-hidden />
      </Link>
    );
  }

  return (
    <div className="group relative flex items-center">
      {/* Vertical accent strip on the left edge when active — gives the
          item an unmistakable "you are here" marker. */}
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-tbb-warning"
        />
      )}
      <Link
        href={item.href}
        data-tour={item.tourId}
        aria-current={isActive ? "page" : undefined}
        {...linkExtras}
        className={
          "flex-1 flex items-center gap-2.5 pl-3 pr-9 py-2 rounded-md text-sm font-bold transition-colors duration-tbb-base " +
          (isActive
            ? "bg-white/15 text-white"
            : "text-white/95 hover:bg-tbb-cream/8 hover:text-white")
        }
      >
        <Icon className="w-4 h-4 flex-none" aria-hidden />
        <span className="truncate">{item.label}</span>
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTogglePin(item.href);
        }}
        aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
        title={isPinned ? "Unpin from favourites" : "Pin to favourites"}
        className={
          "absolute right-1.5 grid place-items-center w-6 h-6 rounded-md transition-opacity " +
          (isPinned
            ? "opacity-100 text-tbb-warning hover:bg-tbb-cream/8"
            : "opacity-0 group-hover:opacity-100 text-white/75 hover:bg-tbb-cream/8 hover:text-tbb-warning")
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

/**
 * Today's pulse — small stat panel that fills the empty space between
 * the nav list and the sign-out footer. Three rows, each a Link to
 * the page that lets you act on the stat.
 */
function TodayPulse({ pulse }: { pulse: BusinessBuilderPulse }) {
  const overdue = pulse.overdueActionsCount;
  const awaiting = pulse.awaitingSignatureCount;
  const next = pulse.nextSession;
  // Things that actually need attention drive the badge count.
  const attention = overdue + awaiting;
  const [open, setOpen] = useState(false);

  const nextTimeLabel = next
    ? new Date(next.scheduledAt).toLocaleString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Edmonton",
      })
    : null;

  return (
    <div className="border-t border-tbb-cream/15 px-3 py-2">
      {/* Compact header — collapsed by default so the sidebar stays clean.
          The badge surfaces anything needing attention without the three
          stacked cards. Click to expand the detail. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-tbb-cream/8 transition-colors"
      >
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-white/55">
          Today
        </span>
        {attention > 0 ? (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-tbb-orange text-white text-[10px] font-bold tabular-nums">
            {attention}
          </span>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-success/90">
            All clear
          </span>
        )}
        {!open && next && (
          <span className="ml-1 text-[10px] text-white/55 truncate">
            · Next {nextTimeLabel}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={
            "ml-auto w-3.5 h-3.5 text-white/40 transition-transform " +
            (open ? "rotate-180" : "")
          }
        />
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5">
          <Link
            href="/business-builder/calendar"
            className="block px-2.5 py-2 rounded-md bg-tbb-cream/5 hover:bg-tbb-cream/12 transition-colors group"
          >
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tbb-caps text-white/55 group-hover:text-white/70">
              <CalendarDays className="w-3 h-3" aria-hidden />
              Next session
            </p>
            {next ? (
              <>
                <p className="text-[11px] font-bold text-white truncate">
                  {nextTimeLabel}
                </p>
                <p className="text-[10px] text-white/65 truncate">
                  {next.engagementName ?? "Engagement"} ·{" "}
                  {next.type.replace(/_/g, " ")}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-white/65 italic">
                Nothing scheduled
              </p>
            )}
          </Link>
          <Link
            href="/business-builder/action-items"
            className={
              "block px-2.5 py-2 rounded-md transition-colors group " +
              (overdue > 0
                ? "bg-tbb-orange/20 hover:bg-tbb-orange/30 border border-tbb-orange/40"
                : "bg-tbb-cream/5 hover:bg-tbb-cream/12")
            }
          >
            <p
              className={
                "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tbb-caps " +
                (overdue > 0
                  ? "text-tbb-orange"
                  : "text-white/55 group-hover:text-white/70")
              }
            >
              <AlertTriangle className="w-3 h-3" aria-hidden />
              Overdue
            </p>
            <p className="text-[13px] font-bold text-white">
              {overdue === 0
                ? "All clear"
                : `${overdue} action item${overdue === 1 ? "" : "s"}`}
            </p>
          </Link>
          <Link
            href="/business-builder/templates"
            className={
              "block px-2.5 py-2 rounded-md transition-colors group " +
              (awaiting > 0
                ? "bg-tbb-blue/15 hover:bg-tbb-blue/25 border border-tbb-blue/40"
                : "bg-tbb-cream/5 hover:bg-tbb-cream/12")
            }
          >
            <p
              className={
                "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tbb-caps " +
                (awaiting > 0
                  ? "text-tbb-blue-light"
                  : "text-white/55 group-hover:text-white/70")
              }
            >
              <PenLine className="w-3 h-3" aria-hidden />
              Awaiting signature
            </p>
            <p className="text-[13px] font-bold text-white">
              {awaiting === 0
                ? "Nothing out"
                : `${awaiting} envelope${awaiting === 1 ? "" : "s"}`}
            </p>
          </Link>
        </div>
      )}
    </div>
  );
}
