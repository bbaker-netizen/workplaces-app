import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/portal(.*)", "/business-builder(.*)"]);

export default clerkMiddleware(async (auth, req) => {
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
