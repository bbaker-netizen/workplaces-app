/**
 * PortalNav — top navigation shell for /portal/*.
 *
 * Phase 3.1: nav links are driven by `getEnabledModules` so each
 * engagement's set of visible modules respects portal_module_
 * assignments and the viewer's role.
 */

import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { NotificationBell } from "./NotificationBell";
import type { PortalModule } from "@/lib/modules";

export function PortalNav({
  fullName,
  unreadCount,
  modules,
}: {
  fullName: string;
  unreadCount: number;
  modules: PortalModule[];
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
        <div className="hidden lg:flex items-center gap-5 flex-wrap max-w-3xl">
          {modules.slice(0, 8).map((m) => (
            <Link
              key={m.key}
              href={m.href}
              className="font-sans text-sm text-foreground hover:text-[#2E4057] transition-colors whitespace-nowrap"
            >
              {m.label}
            </Link>
          ))}
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
      <div className="border-t border-[#CCCCCC]">
        <div className="max-w-5xl mx-auto px-6 py-2 flex gap-5 overflow-x-auto whitespace-nowrap">
          {modules.map((m) => (
            <Link
              key={m.key}
              href={m.href}
              className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground"
            >
              {m.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
