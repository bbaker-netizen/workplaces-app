import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/portal(.*)",
  "/business-builder(.*)",
  "/home(.*)",
]);

// The real app domain. Clerk (auth) is locked to this origin, so the
// login widget renders blank on Netlify's *.netlify.app aliases. Bounce
// the production aliases to the canonical domain. We DON'T touch
// `deploy-preview-*` aliases — those are used for PR preview builds.
const CANONICAL_HOST = "builder.4workplaces.com";
// Every production Netlify alias for this site ends with this suffix: the
// branch alias `main--…` and — crucially — the per-deploy permalink
// `<deployid>--…`. A server-side redirect can briefly land the browser on
// the deploy permalink, where Clerk renders blank, so all of these must
// bounce to the canonical domain. Only `deploy-preview-*` (PR previews)
// are left usable.
const NETLIFY_ALIAS_SUFFIX = "--workplaces-the-builder.netlify.app";

function isRedirectedAlias(host: string): boolean {
  if (host === "workplaces-the-builder.netlify.app") return true;
  if (host.endsWith(NETLIFY_ALIAS_SUFFIX)) {
    return !host.startsWith("deploy-preview-");
  }
  return false;
}

export default clerkMiddleware(async (auth, req) => {
  // Canonical-domain redirect. Runs first so a blank Clerk page on an
  // alias never happens. Drops the query string on purpose — a stale
  // `redirect_url` pointing back at the alias would otherwise loop.
  const host = req.headers.get("host") ?? "";
  if (isRedirectedAlias(host)) {
    return NextResponse.redirect(
      new URL(req.nextUrl.pathname, `https://${CANONICAL_HOST}`),
      308,
    );
  }

  // Legacy /coach/* URLs (bookmarks, old emails, search-engine
  // results) get 301-redirected to /business-builder/* so the
  // rename doesn't break anyone's saved links. Permanent (308)
  // so browsers cache the redirect.
  if (req.nextUrl.pathname === "/coach" || req.nextUrl.pathname.startsWith("/coach/")) {
    const url = req.nextUrl.clone();
    url.pathname = url.pathname.replace(/^\/coach/, "/business-builder");
    return NextResponse.redirect(url, 308);
  }
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and all static files unless requested as
    // search params (the (.*) and ?: parts), per Clerk's recommended
    // matcher.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
