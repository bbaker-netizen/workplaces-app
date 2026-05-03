import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listNotifications } from "@/lib/db/queries/notifications";
import { MarkAllReadOnMount } from "@/components/portal/MarkAllReadOnMount";

const TYPE_LABEL: Record<string, string> = {
  mention: "Mentioned in a message",
  action_item_assigned: "Action item assigned to you",
  action_item_due_soon: "Action item due soon",
};

function detailHrefForNotification(
  type: string,
  parentEntityType: string,
  parentEntityId: string,
): string | null {
  if (parentEntityType === "action_item") {
    return `/portal/action-items/${parentEntityId}`;
  }
  return null;
}

export default async function NotificationsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const notifs = await listNotifications();

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <MarkAllReadOnMount />
      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Portal
        </p>
        <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
          Notifications
        </h1>
      </header>

      {notifs.length === 0 ? (
        <div className="rounded-md border border-dashed border-[#CCCCCC] bg-white px-6 py-12 text-center">
          <p className="font-display font-bold text-foreground text-2xl tracking-tight">
            All clear
          </p>
          <p className="mt-2 font-sans text-sm text-muted-foreground">
            You&apos;ll see action item assignments and (Phase 1.4) message
            mentions here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifs.map((n) => {
            const href = detailHrefForNotification(
              n.type,
              n.parentEntityType,
              n.parentEntityId,
            );
            const inner = (
              <div
                className={
                  "flex items-start gap-3 px-4 py-3 rounded-md border transition-colors " +
                  (n.readAt
                    ? "bg-white border-[#CCCCCC] text-muted-foreground"
                    : "bg-white border-[#2E4057] shadow-[inset_3px_0_0_0_#2E4057]")
                }
              >
                <div className="flex-1 min-w-0">
                  <p className="font-sans text-sm text-foreground">
                    {TYPE_LABEL[n.type] ?? n.type}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {format(new Date(n.createdAt), "MMM d, yyyy · h:mm a")}
                  </p>
                </div>
                {!n.readAt && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#2E4057]">
                    new
                  </span>
                )}
              </div>
            );
            return (
              <li key={n.id}>
                {href ? <Link href={href}>{inner}</Link> : inner}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
