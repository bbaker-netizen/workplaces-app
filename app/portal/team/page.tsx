import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { InviteTeammateForm } from "@/components/team/InviteTeammateForm";

const ROLE_LABEL: Record<string, string> = {
  master_admin: "Business Builder",
  coach: "Business Builder",
  client_lead: "Client Lead",
  client_manager: "Client Manager",
  client_employee: "Client Employee",
  prospect: "Prospect",
};

const ROLE_ORDER: Record<string, number> = {
  master_admin: 0,
  coach: 1,
  client_lead: 2,
  client_manager: 3,
  client_employee: 4,
  prospect: 5,
};

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function PortalTeamPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();
  if (!engagement) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-bold text-foreground text-3xl tracking-tight">
          No engagement yet
        </h1>
      </main>
    );
  }

  const members = await listEngagementMembers(engagement.id);
  members.sort(
    (a, b) =>
      (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99) ||
      a.fullName.localeCompare(b.fullName),
  );

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          My Team
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Everyone with access to this engagement.
        </p>
      </header>

      <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
        {members.map((m) => (
          <li key={m.id} className="py-4 flex items-center gap-4">
            <span
              aria-hidden
              className="shrink-0 w-10 h-10 rounded-full border border-tbb-line bg-tbb-cream-50 grid place-items-center font-mono text-xs uppercase tracking-wider text-tbb-ink-3"
            >
              {initials(m.fullName) || "?"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-sans text-base font-bold text-foreground">
                {m.fullName}
                {m.id === profile.userProfileId && (
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    (you)
                  </span>
                )}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {m.email}
              </p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
              {ROLE_LABEL[m.role] ?? m.role}
            </span>
          </li>
        ))}
      </ul>

      {profile.role === "client_lead" ? (
        <InviteTeammateForm />
      ) : (
        <p className="font-sans text-xs text-muted-foreground italic">
          To add a teammate, ask your engagement lead or your Business Builder
          to send them an invite — they&apos;ll get an email to join this
          engagement.
        </p>
      )}
    </main>
  );
}
