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
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import {
  Briefcase,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  CreditCard,
  DollarSign,
  Eye,
  FileText,
  Filter,
  HelpCircle,
  HeartPulse,
  Hammer,
  Inbox,
  Link as LinkIcon,
  LogOut,
  MessagesSquare,
  Rocket,
  Search,
  Settings,
  Sparkles,
  Star,
  Target,
  Workflow,
} from "lucide-react";
import {
  setSidebarCollapsed,
  toggleNavPin,
} from "@/lib/actions/user-prefs";

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
      { href: "/business-builder/pipeline", label: "Prospects", icon: Filter, tourId: "Coach-pipeline" },
      {
        href: "/diagnostic",
        label: "Public diagnostic",
        icon: LinkIcon,
        tourId: "Coach-diagnostic",
        external: true,
      },
    ],
  },
  {
    key: "engage",
    label: "Engage",
    caption: "Run the rhythm",
    icon: Rocket,
    items: [
      { href: "/business-builder", label: "My work", icon: CheckSquare, tourId: "Coach-home" },
      { href: "/business-builder/engagements", label: "Engagements (Workspace)", icon: Briefcase },
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
      { href: "/business-builder/goals", label: "Goals", icon: Target },
      { href: "/business-builder/soul-search", label: "Soul File search", icon: Search },
    ],
  },
  {
    key: "bill",
    label: "Bill",
    caption: "Invoice and protect margin",
    icon: DollarSign,
    items: [
      { href: "/business-builder/invoices/new", label: "Create invoice", icon: CreditCard, tourId: "Coach-invoice" },
      { href: "/business-builder/subscriptions", label: "Subscriptions", icon: HeartPulse },
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
      { href: "/business-builder/engagements/new", label: "New engagement", icon: Sparkles, tourId: "Coach-new-engagement" },
      { href: "/business-builder/templates", label: "Templates & signatures", icon: FileText },
      { href: "/business-builder/library", label: "Tools & tutorials", icon: Sparkles },
      { href: "/business-builder/settings", label: "Settings", icon: Settings },
      { href: "/business-builder/welcome", label: "Business Builder guide", icon: HelpCircle, tourId: "Coach-guide" },
      { href: "/business-builder/welcome/modules", label: "Module reference", icon: HelpCircle },
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
  unreadCount,
  pinnedNavItems,
  collapsedInitial,
}: {
  fullName: string;
  unreadCount?: number;
  pinnedNavItems: string[];
  collapsedInitial: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(collapsedInitial);
  const [pins, setPins] = useState<string[]>(pinnedNavItems);
  const [, startTransition] = useTransition();

  // Per-phase open/closed state. Defaults to ALL CLOSED so the sidebar
  // is quiet until you click into a section. Persists in localStorage
  // so the choice survives reloads.
  const [openPhases, setOpenPhases] = useState<Set<string>>(() => new Set());

  // On mount, hydrate from localStorage. Everything stays closed
  // unless the user has explicitly opened it in a previous session
  // (we don't auto-open the section containing the current page —
  // Bruce was clear: closed by default means closed by default).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PHASES_STORAGE_KEY);
      const stored: string[] = raw ? JSON.parse(raw) : [];
      setOpenPhases(new Set<string>(stored));
    } catch {
      // localStorage unavailable / corrupted → leave defaults (all closed).
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

  const pinnedItems = pins
    .map((href) => ALL_ITEMS_BY_HREF.get(href))
    .filter((it): it is BusinessBuilderNavItem => Boolean(it));

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

        {BUSINESS_BUILDER_PHASES.map((phase) => {
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
          // Expanded mode: bigger section header that's a real click
          // target. Defaults to closed so the sidebar shows just five
          // tidy section rows; clicking any expands it.
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
                  (isOpen || hasActiveChild
                    ? "bg-tbb-cream/8 text-white"
                    : "text-white/90 hover:bg-tbb-cream/5 hover:text-white")
                }
              >
                <span
                  className={
                    "grid place-items-center w-8 h-8 rounded-md shrink-0 transition-colors " +
                    (hasActiveChild
                      ? "bg-tbb-blue text-white"
                      : "bg-tbb-cream/10 text-tbb-blue-light group-hover:bg-tbb-cream/15")
                  }
                  aria-hidden
                >
                  <PhaseIcon className="w-4 h-4" />
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
            <Link
              href="/portal?preview=1"
              title="Preview the client portal as your client would see it"
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tbb-caps px-2.5 py-1 rounded-pill bg-tbb-cream/10 text-white/90 hover:bg-tbb-cream/20 hover:text-white transition-colors duration-tbb-base border border-tbb-cream/15"
            >
              <Eye className="w-3 h-3" aria-hidden />
              Client Portal View
            </Link>
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
          "flex-1 flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-md text-sm font-bold transition-colors duration-tbb-base " +
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
