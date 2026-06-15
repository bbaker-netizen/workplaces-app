/**
 * /business-builder/drive-link — auto-link client Drive folders.
 *
 * Coach-only. Scans the connected Google Drive, matches folders to
 * engagements by name, and bulk-links them (read-only mirror) so the coach
 * doesn't have to paste folder URLs one at a time. For full two-way sync,
 * use "Create managed folder" on a client's Documents page instead.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FolderSymlink } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getConnectionStatus } from "@/lib/integrations/google-calendar";
import { DriveFolderMatcher } from "@/components/drive/DriveFolderMatcher";

export default async function DriveLinkPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }
  const status = await getConnectionStatus(profile.userProfileId);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/business-builder/engagements"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Engagements
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight flex items-center gap-2">
          <FolderSymlink className="w-7 h-7" aria-hidden /> Auto-link Drive folders
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Scan your Google Drive and we&apos;ll match each existing client
          folder to its engagement by name, so you can link them all at once
          instead of pasting URLs. Linked folders mirror into each client&apos;s
          portal (read-only). For two-way sync, use{" "}
          <span className="font-bold">Create managed folder</span> on a
          client&apos;s Documents page.
        </p>
      </header>

      {!status.connected ? (
        <div className="border border-tbb-line rounded-lg bg-white p-5 space-y-2">
          <p className="text-sm text-tbb-ink-2">
            Connect Google first to scan your Drive.
          </p>
          <Link
            href="/business-builder/profile/google-calendar"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 w-fit"
          >
            Connect Google
          </Link>
        </div>
      ) : (
        <DriveFolderMatcher />
      )}
    </main>
  );
}
