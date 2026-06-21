import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  getSession,
  listSessionActionItems,
} from "@/lib/db/queries/bbs-sessions";
import { listCoachEngagements } from "@/lib/db/queries/engagements";
import { SessionDetail } from "@/components/sessions/SessionDetail";

export default async function CoachSessionDetailPage({
  params,
}: {
  params: { engagementId: string; sessionId: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const engagements = await listCoachEngagements();
  const engagement = engagements.find((e) => e.id === params.engagementId);
  if (!engagement) notFound();

  const session = await getSession(params.sessionId);
  if (!session || session.engagementId !== engagement.id) notFound();

  const actionItems = await listSessionActionItems(session.id);

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 sm:py-12 space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console · {engagement.name ?? "Engagement"}
        </p>
        <Link
          href={`/business-builder/sessions/${engagement.id}`}
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← All sessions
        </Link>
      </header>

      <SessionDetail
        session={{
          id: session.id,
          scheduledAt: session.scheduledAt,
          type: session.type,
          status: session.status,
          notes: session.notes,
          firefliesRecordingId: session.firefliesRecordingId,
        }}
        backHref={`/business-builder/sessions/${engagement.id}`}
        canManage
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
                  href={`/business-builder/action-items/${it.id}`}
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
