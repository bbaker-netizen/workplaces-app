/**
 * /portal/notes — the client's private notepad.
 *
 * One markdown scratchpad per user per engagement, visible only to its
 * owner. Editable even when the engagement is read-only (it's personal
 * space, not engagement collaboration).
 */

import { redirect } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { getMyPortalNoteBody } from "@/lib/actions/portal-notes";
import { PortalNotesEditor } from "@/components/portal/PortalNotesEditor";

export default async function PortalNotesPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();
  if (!engagement) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-bold text-foreground text-3xl tracking-tight">
          My Notes
        </h1>
        <p className="mt-4 text-muted-foreground">
          Your portal isn&apos;t bound to an engagement yet.
        </p>
      </main>
    );
  }

  const body = await getMyPortalNoteBody(engagement.id);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 sm:py-12 space-y-6">
      <header className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground inline-flex items-center gap-1.5">
          <NotebookPen className="w-3.5 h-3.5" aria-hidden /> Private to you
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          My Notes
        </h1>
        <p className="text-sm text-muted-foreground">
          Your own scratchpad — questions for the next session, ideas,
          reminders. Nobody else can see this, not even your Business Builder.
        </p>
      </header>
      <PortalNotesEditor engagementId={engagement.id} initialBody={body} />
    </main>
  );
}
