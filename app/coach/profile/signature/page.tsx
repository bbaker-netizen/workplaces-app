/**
 * Coach signature image management — Phase 4.5.
 *
 * Coach uploads a JPG/PNG of their signature once. When creating a
 * signing envelope they can check "auto-sign as me" — the stored
 * image is applied as the first signer (status=signed) without a
 * round-trip through the signing page.
 *
 * Storage is the `user_profiles.signature_image_data` column (data URL).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { CoachSignatureManager } from "@/components/signing/CoachSignatureManager";

export default async function CoachSignaturePage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const current = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ signatureImageData: userProfiles.signatureImageData })
      .from(userProfiles)
      .where(eq(userProfiles.id, profile.userProfileId))
      .limit(1);
    return row?.signatureImageData ?? null;
  });

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Coach Console
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          Your signature
        </h1>
        <p className="font-sans text-sm text-foreground">
          Upload a JPG or PNG of your signature once. When you create a
          signing envelope you can check &quot;auto-sign as me&quot; and your
          stored signature gets applied without you having to draw it again.
        </p>
        <Link
          href="/coach"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← Console
        </Link>
      </header>

      <CoachSignatureManager initial={current} />

      <section className="border border-tbb-line rounded-md bg-white p-4 space-y-2">
        <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Tips
        </h2>
        <ul className="font-sans text-sm text-foreground space-y-1 list-disc pl-5">
          <li>
            Crop tight to the signature — no extra white space — for the best
            placement on the certificate page.
          </li>
          <li>
            Transparent PNG looks cleanest. JPG works too but ships with a
            background.
          </li>
          <li>Keep file size under 600 KB.</li>
        </ul>
      </section>
    </main>
  );
}
