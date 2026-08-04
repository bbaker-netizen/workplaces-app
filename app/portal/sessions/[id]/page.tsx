import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  getSession,
  listSessionActionItems,
} from "@/lib/db/queries/bbs-sessions";
import { listSessionAgenda } from "@/lib/db/queries/agenda-items";
import { clientWriteBlocked } from "@/lib/server/engagement-guard";
import { SessionDetail } from "@/components/sessions/SessionDetail";
import { SessionAgenda } from "@/components/sessions/SessionAgenda";

export default async function PortalSessionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const session = await getSession(params.id);
  if (!session) notFound();

  // Only Business Builders manage sessions; clients view read-only.
  const canManage =
    profile.role === "master_admin" || profile.role === "coach";

  const [actionItems, agenda, writeBlocked] = await Promise.all([
    listSessionActionItems(session.id),
    listSessionAgenda(session.id),
    // The same guard the write action applies, rather than a second
    // reading of the engagement's status. Returns false for coaches.
    clientWriteBlocked(profile.role, session.engagementId),
  ]);

  // Who may put something on this agenda.
  //
  // Everyone in the engagement except a prospect, which mirrors
  // `canContribute` in lib/actions/agenda-items.ts — the server is the
  // authority and will refuse regardless; this only decides whether the
  // form is worth rendering.
  //
  // Two closures on top: a session already past or cancelled is a record
  // rather than a plan, and a paused engagement is read-only for client
  // roles. A form that submits into a guaranteed refusal is worse than
  // no form.
  const sessionIsOpen =
    session.status === "scheduled" && new Date(session.scheduledAt) >= new Date();
  const canContribute =
    profile.role !== "prospect" && sessionIsOpen && !writeBlocked;

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <SessionDetail
        session={{
          id: session.id,
          scheduledAt: session.scheduledAt,
          type: session.type,
          status: session.status,
          notes: session.notes,
          firefliesRecordingId: session.firefliesRecordingId,
        }}
        backHref="/portal/sessions"
        canManage={canManage}
      />

      <SessionAgenda
        sessionId={session.id}
        items={agenda}
        currentUserProfileId={profile.userProfileId}
        canContribute={canContribute}
        canManage={canManage}
        audience={canManage ? "builder" : "client"}
      />

      {actionItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold text-foreground text-lg tracking-tight">
            Action items from this session
          </h2>
          <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
            {actionItems.map((it) => (
              <li key={it.id} className="py-3">
                <Link
                  href={`/portal/action-items/${it.id}`}
                  className="block group"
                >
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="font-sans text-sm font-bold text-foreground group-hover:underline underline-offset-4">
                      {it.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                      {it.status}
                    </span>
                    {it.dueDate && (
                      <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                        Due {it.dueDate.toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
