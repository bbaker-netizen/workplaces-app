/**
 * Retired — Soul File is removed across the app. Any stale link/bookmark
 * bounces back to the engagement workspace.
 */

import { redirect } from "next/navigation";

export default async function RetiredCoachSoulFile({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;
  redirect(`/business-builder/engagements/${engagementId}`);
}
