import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  getSession,
  listSessionActionItems,
} from "@/lib/db/queries/bbs-sessions";
import { SessionDetail } from "@/components/sessions/SessionDetail";

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

  const actionItems = await listSessionActionItems(session.id);

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
