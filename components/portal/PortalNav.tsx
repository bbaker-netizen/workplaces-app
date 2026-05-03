/**
 * PortalNav — top navigation shell for /portal/*.
 *
 * Server component: receives display data via props, renders static nav
 * with the brand wordmark, a primary nav link to action items, and the
 * sign-out button (Clerk's <SignOutButton> handles its own client logic).
 *
 * Phase 1.2: action items is the only module. Notification bell lands
 * in Step 6.
 */

import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { NotificationBell } from "./NotificationBell";

export function PortalNav({
  fullName,
  unreadCount,
}: {
  fullName: string;
  unreadCount: number;
}) {
  return (
    <nav className="border-b border-[#CCCCCC] bg-background">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link
          href="/portal"
          className="font-display font-bold tracking-tight text-foreground text-lg sm:text-xl uppercase"
        >
          The Builder
        </Link>
        <div className="hidden sm:flex items-center gap-6">
          <Link
            href="/portal/action-items"
            className="font-sans text-sm text-foreground hover:text-[#2E4057] transition-colors"
          >
            Action items
          </Link>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <NotificationBell unreadCount={unreadCount} />
          <span className="hidden sm:inline font-mono text-xs text-muted-foreground">
            {fullName}
          </span>
          <SignOutButton redirectUrl="/">
            <button className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline">
              Sign out
            </button>
          </SignOutButton>
        </div>
      </div>
      <div className="sm:hidden border-t border-[#CCCCCC]">
        <div className="max-w-5xl mx-auto px-6 py-2">
          <Link
            href="/portal/action-items"
            className="font-sans text-sm text-foreground"
          >
            Action items
          </Link>
        </div>
      </div>
    </nav>
  );
}
