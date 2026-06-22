import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listBusinessBuildersForAdmin } from "@/lib/db/queries/bb-access";
import { CONSOLE_MODULES } from "@/lib/console-modules";
import { BbAccessManager } from "@/components/business-builder/BbAccessManager";

/**
 * Team access — master_admin only. Configure each Business Builder's reach:
 * which clients and which console modules they can use.
 */
export default async function BbAccessPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin") redirect("/business-builder");

  const data = await listBusinessBuildersForAdmin();
  if (!data) redirect("/business-builder");

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Settings
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Team access
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Choose which clients and which console modules each Business Builder
          can access. Everyone has full access by default; master admins always
          keep full access.
        </p>
      </header>

      <BbAccessManager
        users={data.users}
        clients={data.clients}
        modules={CONSOLE_MODULES}
      />
    </main>
  );
}
