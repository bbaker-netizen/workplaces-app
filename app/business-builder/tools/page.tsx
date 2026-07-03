import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { QuickSendTools } from "@/components/business-builder/QuickSendTools";

/**
 * Send — stand-alone tools any Business Builder can use: send the
 * diagnostic link, or ask a client for a Google review, by email or text.
 */
export default async function QuickSendPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Tools
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Send — diagnostic &amp; Google review
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Fire off a diagnostic or a Google-review request to anyone — by email
          or text — without leaving this page.
        </p>
      </header>

      <QuickSendTools />
    </main>
  );
}
