import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { isSmsConfigured } from "@/lib/integrations/twilio";
import { SmsCheckPanel } from "@/components/business-builder/SmsCheckPanel";

/**
 * Text messaging (SMS) status + test — reachable by any Business Builder so
 * they can confirm texting works (answers "how do I know my SMS is on?").
 */
export default async function SmsCheckPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const configured = isSmsConfigured();

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/business-builder/settings"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Settings
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Text messaging (SMS)
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Check whether texting is working for your account and send yourself a
          test. You send SMS from a prospect or a Communication thread; this
          page just confirms the connection.
        </p>
      </header>

      <SmsCheckPanel configured={configured} />
    </main>
  );
}
