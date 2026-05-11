/**
 * Portal footer — navy bar with cream-tinted text, visible support link.
 */

import Link from "next/link";
import Image from "next/image";

export function PortalFooter() {
  return (
    <footer className="bg-tbb-navy-900 text-tbb-cream mt-16">
      <div className="max-w-tbb-container mx-auto px-6 py-8 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-4">
          <Image
            src="/brand/logo-cream.png"
            alt="The Business Builders by Workplaces"
            width={180}
            height={40}
            className="h-8 w-auto opacity-90"
          />
        </div>
        <div className="flex items-baseline gap-6 flex-wrap">
          <a
            href="mailto:bruce@4workplaces.com"
            className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-cream/75 hover:text-tbb-cream transition-colors duration-tbb-base"
          >
            Contact support
          </a>
          <Link
            href="https://4workplaces.com/privacy-policy/"
            className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-cream/75 hover:text-tbb-cream transition-colors duration-tbb-base"
          >
            Privacy
          </Link>
          <Link
            href="https://4workplaces.com/terms/"
            className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-cream/75 hover:text-tbb-cream transition-colors duration-tbb-base"
          >
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
