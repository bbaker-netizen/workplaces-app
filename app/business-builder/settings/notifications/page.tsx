import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { Bell, MessageCircle } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listBusinessBuilderNotifications } from "@/lib/db/queries/notifications";
import { MarkAllReadOnMount } from "@/components/portal/MarkAllReadOnMount";
import { PushToggle } from "@/components/notifications/PushToggle";
import { CheckFollowupsButton } from "@/components/notifications/CheckFollowupsButton";

/**
 * Business Builder notifications feed — team-discussion @mentions,
 * action-item updates, and anything else routed to a Business Builder.
 * Lives under Settings; visiting it marks everything read (clears the
 * sidebar count). The sidebar bell badge links straight here.
 */
export default async function BusinessBuilderNotificationsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const notifs = await listBusinessBuilderNotifications();

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <MarkAllReadOnMount />
      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Settings
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Notifications
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Team comments on leads and clients, plus updates routed to you.
        </p>
      </header>

      <div className="mb-8 space-y-3">
        <PushToggle />
        <CheckFollowupsButton />
      </div>

      {notifs.length === 0 ? (
        <div className="rounded-md border border-dashed border-tbb-line bg-white px-6 py-12 text-center">
          <Bell className="w-6 h-6 mx-auto text-tbb-ink-4" aria-hidden />
          <p className="mt-3 font-bold text-foreground text-2xl tracking-tight">
            All clear
          </p>
          <p className="mt-2 font-sans text-sm text-muted-foreground">
            When a teammate comments on a lead and notifies you, it shows up
            here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifs.map((n) => {
            const inner = (
              <div
                className={
                  "flex items-start gap-3 px-4 py-3 rounded-md border transition-colors " +
                  (n.readAt
                    ? "bg-white border-tbb-line text-muted-foreground"
                    : "bg-white border-tbb-blue shadow-[inset_3px_0_0_0_#2E4057]")
                }
              >
                <span className="mt-0.5 w-7 h-7 flex-none rounded-pill bg-tbb-blue-100 text-tbb-blue grid place-items-center">
                  <MessageCircle className="w-3.5 h-3.5" aria-hidden />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-sans text-sm text-foreground">
                    {n.contextLabel ?? "Notification"}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {format(new Date(n.createdAt), "MMM d, yyyy · h:mm a")}
                  </p>
                </div>
                {!n.readAt && (
                  <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-navy">
                    new
                  </span>
                )}
              </div>
            );
            return (
              <li key={n.id}>
                {n.href ? <Link href={n.href}>{inner}</Link> : inner}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
