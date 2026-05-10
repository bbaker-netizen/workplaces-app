/**
 * Portal footer — minimal, brand-consistent, with a visible support
 * contact. Required by Intuit's app review (a customer must be able
 * to reach support from inside the app).
 */

import Link from "next/link";

export function PortalFooter() {
  return (
    <footer className="border-t border-[#CCCCCC] bg-background mt-12">
      <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between gap-3 flex-wrap">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          The Builder · By Workplaces
        </p>
        <div className="flex items-baseline gap-4 flex-wrap">
          <a
            href="mailto:bruce@4workplaces.com"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Contact support
          </a>
          <Link
            href="https://4workplaces.com/privacy-policy/"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Privacy
          </Link>
          <Link
            href="https://4workplaces.com/terms/"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
