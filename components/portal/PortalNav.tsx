/**
 * PortalNav — top navigation shell for /portal/*.
 *
 * The Business Builders by Workplaces brand: navy bar with cream-tinted
 * text and Lucide icons. Logo lockup at left, primary nav center, user
 * controls at right. Active section gets the blue accent.
 */

import Link from "next/link";
import Image from "next/image";
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
    <nav className="bg-tbb-navy text-tbb-cream">
      <div className="max-w-tbb-container mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link href="/portal" className="flex items-center gap-3" aria-label="The Business Builders home">
          <Image
            src="/brand/logo-cream.png"
            alt="The Business Builders by Workplaces"
            width={220}
            height={48}
            priority
            className="h-10 w-auto"
          />
        </Link>
        <div className="hidden lg:flex items-center gap-1 flex-wrap max-w-3xl">
          {modules.slice(0, 8).map((m) => (
            <Link
              key={m.key}
              href={m.href}
              className="rounded-md px-3 py-1.5 text-sm font-bold text-tbb-cream/85 hover:bg-tbb-cream/10 hover:text-tbb-cream transition-colors duration-tbb-base whitespace-nowrap"
            >
              {m.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <NotificationBell unreadCount={unreadCount} />
          <span className="hidden sm:inline text-xs text-tbb-cream/65 tabular-nums">
            {fullName}
          </span>
          <SignOutButton redirectUrl="/">
            <button className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-cream/65 hover:text-tbb-cream transition-colors duration-tbb-base">
              Sign out
            </button>
          </SignOutButton>
        </div>
      </div>
      {modules.length > 0 && (
        <div className="border-t border-tbb-cream/15">
          <div className="max-w-tbb-container mx-auto px-6 py-2 flex gap-4 overflow-x-auto whitespace-nowrap">
            {modules.map((m) => (
              <Link
                key={m.key}
                href={m.href}
                className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-cream/65 hover:text-tbb-cream transition-colors duration-tbb-base"
              >
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
