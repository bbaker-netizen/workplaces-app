/**
 * PortalNav — top navigation shell for /portal/*.
 *
 * Server component: receives display data via props, renders static nav
 * with the brand wordmark, primary module links, and the sign-out
 * button (Clerk's <SignOutButton> handles its own client logic).
 *
 * Phase 1.2 added: action items.
 * Phase 1.3 added: communication.
 * Phase 1.5 added: documents.
 * Phase 1.6 added: sessions.
 * Phase 1.7 added: soul file.
 * Phase 1.10/1.11/1.12 added: goals, team, methodology resources.
 * Phase 1.14 added: projects.
 * Phase 1.15 added: hiring pipeline.
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
          <Link
            href="/portal/goals"
            className="font-sans text-sm text-foreground hover:text-[#2E4057] transition-colors"
          >
            Goals
          </Link>
          <Link
            href="/portal/projects"
            className="font-sans text-sm text-foreground hover:text-[#2E4057] transition-colors"
          >
            Projects
          </Link>
          <Link
            href="/portal/sessions"
            className="font-sans text-sm text-foreground hover:text-[#2E4057] transition-colors"
          >
            Sessions
          </Link>
          <Link
            href="/portal/communication"
            className="font-sans text-sm text-foreground hover:text-[#2E4057] transition-colors"
          >
            Communication
          </Link>
          <Link
            href="/portal/documents"
            className="font-sans text-sm text-foreground hover:text-[#2E4057] transition-colors"
          >
            Documents
          </Link>
          <Link
            href="/portal/soul-file"
            className="font-sans text-sm text-foreground hover:text-[#2E4057] transition-colors"
          >
            Soul File
          </Link>
          <Link
            href="/portal/team"
            className="font-sans text-sm text-foreground hover:text-[#2E4057] transition-colors"
          >
            Team
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
        <div className="max-w-5xl mx-auto px-6 py-2 flex gap-5 overflow-x-auto whitespace-nowrap">
          <Link href="/portal/action-items" className="font-sans text-sm text-foreground">Action items</Link>
          <Link href="/portal/goals" className="font-sans text-sm text-foreground">Goals</Link>
          <Link href="/portal/projects" className="font-sans text-sm text-foreground">Projects</Link>
          <Link href="/portal/hiring" className="font-sans text-sm text-foreground">Hiring</Link>
          <Link href="/portal/sessions" className="font-sans text-sm text-foreground">Sessions</Link>
          <Link href="/portal/communication" className="font-sans text-sm text-foreground">Communication</Link>
          <Link href="/portal/documents" className="font-sans text-sm text-foreground">Documents</Link>
          <Link href="/portal/soul-file" className="font-sans text-sm text-foreground">Soul File</Link>
          <Link href="/portal/team" className="font-sans text-sm text-foreground">Team</Link>
          <Link href="/portal/methodology" className="font-sans text-sm text-foreground">Methodology</Link>
        </div>
      </div>
    </nav>
  );
}
