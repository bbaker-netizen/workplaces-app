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
const REDIRECTED_ALIASES = new Set([
  "main--workplaces-the-builder.netlify.app",
  "workplaces-the-builder.netlify.app",
]);

export default clerkMiddleware(async (auth, req) => {
  // Canonical-domain redirect. Runs first so a blank Clerk page on an
  // alias never happens. Drops the query string on purpose — a stale
  // `redirect_url` pointing back at the alias would otherwise loop.
  const host = req.headers.get("host") ?? "";
  if (REDIRECTED_ALIASES.has(host)) {
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
