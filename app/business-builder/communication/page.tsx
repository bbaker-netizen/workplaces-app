/**
 * /business-builder/communication — engagement picker.
 *
 * Communication is engagement-scoped — there's no "all clients in one
 * thread" view because that would dump leadership and team threads
 * from every client into a single feed. So this index page lists every
 * engagement Bruce owns and links each to its detail page. With one
 * engagement, we redirect straight in.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, MessagesSquare } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachEngagements } from "@/lib/db/queries/engagements";

export default async function CommunicationIndexPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const engagements = await listCoachEngagements();

  // Single engagement → straight in. Saves a click.
  if (engagements.length === 1) {
    redirect(`/business-builder/communication/${engagements[0].id}`);
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <p className="tbb-eyebrow">Business Builder Console</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Communication
        </h1>
        <p className="text-sm text-tbb-ink-3">
          Pick a client to open their threads and external communications.
        </p>
      </header>

      {engagements.length === 0 ? (
        <div className="border border-tbb-line rounded-lg bg-white p-8 text-center space-y-2">
          <p className="font-bold text-tbb-navy">No active engagements yet.</p>
          <p className="text-sm text-tbb-ink-3">
            Create one from{" "}
            <Link
              href="/business-builder/engagements/new"
              className="text-tbb-blue hover:underline"
            >
              New engagement
            </Link>{" "}
            to start a conversation.
          </p>
        </div>
      ) : (
        <ul className="border border-tbb-line rounded-lg bg-white divide-y divide-tbb-line-soft overflow-hidden shadow-tbb-sm">
          {engagements.map((e) => (
            <li key={e.id}>
              <Link
                href={`/business-builder/communication/${e.id}`}
                className="flex items-center gap-3 px-5 py-4 hover:bg-tbb-cream-50 transition-colors"
              >
                <span className="grid place-items-center w-9 h-9 rounded-md bg-tbb-cream-50 text-tbb-blue">
                  <MessagesSquare className="w-4 h-4" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-tbb-navy">
                    {e.name ?? "Engagement"}
                  </span>
                  <span className="block text-xs text-tbb-ink-3 uppercase tracking-tbb-caps">
                    {e.type} · {e.status}
                  </span>
                </span>
                <ArrowRight
                  className="w-4 h-4 text-tbb-ink-3"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
