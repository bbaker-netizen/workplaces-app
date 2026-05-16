"use client";

/**
 * CoachSidebar — left-side vertical navigation for the Business Builder Console.
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
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import {
  Briefcase,
  CalendarClock,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Filter,
  HelpCircle,
  HeartPulse,
  Inbox,
  LineChart,
  Link as LinkIcon,
  MessagesSquare,
  PenSquare,
  Search,
  Settings,
  Sparkles,
  Star,
  Target,
  UserCheck,
} from "lucide-react";
import {
  setSidebarCollapsed,
  toggleNavPin,
} from "@/lib/actions/user-prefs";

type CoachNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tourId?: string;
  /** Open in a new tab. Use for client-facing surfaces (e.g. the
   *  public diagnostic) so the Business Builder doesn't get trapped
   *  on a page with no nav back to the console. */
  external?: boolean;
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
      {
        href: "/diagnostic",
        label: "Public diagnostic",
        icon: LinkIcon,
        tourId: "coach-diagnostic",
        external: true,
      },
    ],
  },
  {
    key: "engage",
    label: "Engage",
    caption: "Run the rhythm",
    items: [
      { href: "/coach", label: "My work", icon: CheckSquare, tourId: "coach-home" },
      { href: "/coach/action-items", label: "Action items", icon: CheckSquare },
      { href: "/coach/inbox", label: "Inbox (email / SMS / calls)", icon: Inbox },
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
      { href: "/coach/profile/google-calendar", label: "Google Calendar", icon: CalendarClock },
      { href: "/coach/profile/quickbooks", label: "QuickBooks", icon: LineChart },
      { href: "/coach/welcome", label: "Business Builder guide", icon: HelpCircle, tourId: "coach-guide" },
      { href: "/coach/welcome/modules", label: "Module reference", icon: HelpCircle },
    ],
  },
];

// Flat lookup of all items by href for the Favourites resolver.
const ALL_ITEMS_BY_HREF = new Map<string, CoachNavItem>();
for (const phase of COACH_PHASES) {
  for (const item of phase.items) ALL_ITEMS_BY_HREF.set(item.href, item);
}

export function CoachSidebar({
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
  const [collapsed, setCollapsed] = useState(collapsedInitial);
  const [pins, setPins] = useState<string[]>(pinnedNavItems);
  const [, startTransition] = useTransition();

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
    .filter((it): it is CoachNavItem => Boolean(it));

  return (
    <aside
      className={
        "bg-tbb-navy text-tbb-cream sticky top-0 h-screen flex flex-col transition-all duration-tbb-base " +
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
            href="/coach"
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
            className="shrink-0 grid place-items-center w-7 h-7 rounded-md text-tbb-cream/70 hover:bg-tbb-cream/8 hover:text-tbb-cream transition-colors"
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
                  onTogglePin={onTogglePin}
                />
              ))}
            </div>
          </section>
        )}

        {COACH_PHASES.map((phase, phaseIdx) => (
          <section
            key={phase.key}
            className={collapsed ? "space-y-1" : "space-y-1.5"}
            data-tour={`coach-phase-${phase.key}`}
          >
            {!collapsed ? (
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
            ) : (
              <div className="grid place-items-center text-tbb-blue-light/60 text-[9px] font-bold tracking-tbb-caps tabular-nums py-0.5">
                {String(phaseIdx + 1).padStart(2, "0")}
              </div>
            )}
            <div className={collapsed ? "space-y-0.5" : "space-y-0.5 pl-1"}>
              {phase.items.map((item) => (
                <NavItemRow
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  isPinned={pins.includes(item.href)}
                  onTogglePin={onTogglePin}
                />
              ))}
            </div>
          </section>
        ))}
      </nav>

      {/* Footer */}
      <div
        className={
          "border-t border-tbb-cream/15 flex items-center justify-between gap-2 " +
          (collapsed ? "px-2 py-3 flex-col" : "px-3 py-3")
        }
      >
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-tbb-cream truncate">{fullName}</p>
            <div className="flex gap-3 mt-0.5">
              <Link
                href="/portal?preview=1"
                className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-cream/55 hover:text-tbb-cream transition-colors duration-tbb-base"
                title="Preview the client portal as your client would see it"
              >
                Portal preview
              </Link>
              <SignOutButton redirectUrl="/">
                <button className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-cream/55 hover:text-tbb-cream transition-colors duration-tbb-base">
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
              aria-label={`Sign out (${fullName})`}
              title={`Sign out (${fullName})`}
              className="grid place-items-center w-9 h-9 rounded-md text-tbb-cream/70 hover:bg-tbb-cream/8 hover:text-tbb-cream transition-colors"
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
  onTogglePin,
}: {
  item: CoachNavItem;
  collapsed: boolean;
  isPinned: boolean;
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
        {...linkExtras}
        className="grid place-items-center w-10 h-10 mx-auto rounded-md text-tbb-cream/85 hover:bg-tbb-cream/8 hover:text-tbb-cream transition-colors duration-tbb-base"
      >
        <Icon className="w-4 h-4" aria-hidden />
      </Link>
    );
  }

  return (
    <div className="group relative flex items-center">
      <Link
        href={item.href}
        data-tour={item.tourId}
        {...linkExtras}
        className="flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-bold text-tbb-cream/85 hover:bg-tbb-cream/8 hover:text-tbb-cream transition-colors duration-tbb-base"
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
