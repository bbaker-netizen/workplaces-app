import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";

/**
 * Coach Console layout — role gate for /coach/*.
 *
 * Phase 1.1: only master_admin reaches the coach side. Future roles
 * (a generic 'coach' role for Jen and future hires) will be added here
 * when introduced. Anyone else gets bounced to /portal.
 */
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await ensureUserProfile();
  if (result.status !== "ok") redirect("/no-invitation");
  if (result.role !== "master_admin") redirect("/portal");

  return <div className="min-h-screen bg-background">{children}</div>;
}
