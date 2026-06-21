import { cookies } from "next/headers";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  getCurrentEngagement,
  PORTAL_PREVIEW_COOKIE,
} from "@/lib/db/queries/engagements";
import { PreviewRefresh } from "@/components/portal/PreviewRefresh";

/**
 * /portal template — re-renders on EVERY navigation (unlike layout.tsx,
 * which Next.js preserves across client-side navigation between sibling
 * pages).
 *
 * The coach "preview" banner lives here on purpose. It names which client
 * the coach is currently previewing, and that MUST stay in lockstep with
 * the page content. When the banner sat in the persisted layout it went
 * stale — the layout kept rendering the previously-previewed client while
 * the pages (which re-fetch per navigation) showed the actually-selected
 * one, so the banner said "A&M" while every module showed "Impactica".
 *
 * Rendering it from the template re-resolves the current engagement on
 * each navigation, so the banner can never contradict what's on screen.
 */
export default async function PortalTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await ensureUserProfile();
  const isCoachRole =
    profile.status === "ok" &&
    (profile.role === "master_admin" || profile.role === "coach");
  const inPreview = cookies().get(PORTAL_PREVIEW_COOKIE)?.value === "1";

  // Only coaches actively previewing a client portal see the banner.
  const engagement = isCoachRole && inPreview ? await getCurrentEngagement() : null;

  return (
    <>
      {isCoachRole && inPreview && <PreviewRefresh />}
      {isCoachRole && inPreview && (
        <div className="border-b border-tbb-blue/30 bg-tbb-blue-50 px-6 py-2.5 text-sm flex items-center gap-x-4 gap-y-1 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue">
            Coach preview
          </span>
          <span className="text-tbb-ink-2">
            You&apos;re previewing{" "}
            <strong className="text-tbb-navy">
              {engagement?.name ?? "a client portal"}
            </strong>
            . This is what they see.
          </span>
          <a
            href="/business-builder/engagements"
            className="ml-auto inline-flex items-center text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
          >
            Switch client
          </a>
          <a
            href="/home"
            className="inline-flex items-center text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
          >
            Exit preview
          </a>
        </div>
      )}
      {children}
    </>
  );
}
