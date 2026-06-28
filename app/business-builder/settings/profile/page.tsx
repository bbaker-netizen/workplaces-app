/**
 * /business-builder/settings/profile — your personal profile. Most fields live in
 * Clerk (name, email, password, MFA, profile photo) and are edited
 * via Clerk's hosted profile modal. The fields the app owns directly
 * (email signature, e-sig image) link out to the existing
 * /business-builder/templates page where they already live.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, ArrowRight, Bot, Mail, PenTool, UserRound } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ProfileClerkButton } from "@/components/settings/ProfileClerkButton";
import { EmailSignatureEditor } from "@/components/templates/EmailSignatureEditor";
import { AnthropicKeyEditor } from "@/components/settings/AnthropicKeyEditor";

export default async function ProfileSettingsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  // Pull the user's full profile so we can surface the read-only
  // summary and link the signature/e-sig to /business-builder/templates.
  const me = await withSystemContext(async (tx) => {
    const [u] = await tx
      .select({
        fullName: userProfiles.fullName,
        email: userProfiles.email,
        emailSignature: userProfiles.emailSignature,
        signatureImageData: userProfiles.signatureImageData,
        anthropicApiKey: userProfiles.anthropicApiKey,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, profile.userProfileId))
      .limit(1);
    return u ?? null;
  });

  const hasESig = Boolean(me?.signatureImageData);
  const hasAnthropicKey = Boolean(me?.anthropicApiKey);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/business-builder/settings"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Settings
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Profile
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Your personal account — name, email, password, signatures.
          Identity fields live in Clerk (the sign-in provider);
          signatures live with the app.
        </p>
      </header>

      <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-4 shadow-tbb-sm">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-md bg-tbb-blue-50 text-tbb-blue shrink-0">
            <UserRound className="w-5 h-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-bold text-tbb-navy text-base">
              Name, email, password
            </h2>
            <p className="text-xs text-tbb-ink-3">
              Managed by Clerk (the sign-in provider).
            </p>
          </div>
        </div>
        <dl className="text-sm grid grid-cols-[100px_1fr] gap-y-1.5 gap-x-3">
          <dt className="text-tbb-ink-3">Name</dt>
          <dd className="text-tbb-navy font-bold">
            {me?.fullName ?? "—"}
          </dd>
          <dt className="text-tbb-ink-3">Email</dt>
          <dd className="text-tbb-navy">{me?.email ?? "—"}</dd>
          <dt className="text-tbb-ink-3">Role</dt>
          <dd className="text-tbb-navy capitalize">
            {profile.role.replace(/_/g, " ")}
          </dd>
        </dl>
        <div>
          <ProfileClerkButton />
          <p className="text-[11px] text-tbb-ink-3 mt-2">
            Opens the Clerk profile modal where you can change your
            name, email, password, two-factor authentication, and
            profile photo. Changes sync back to The Builder
            automatically.
          </p>
        </div>
      </section>

      <section
        id="email-signature"
        className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm"
      >
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-md bg-tbb-blue-50 text-tbb-blue shrink-0">
            <Mail className="w-5 h-5" aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="font-bold text-tbb-navy text-base">
              Email signature
            </h2>
            <p className="text-xs text-tbb-ink-3">
              Appears on every email you send through the app. Each Business
              Builder sets their own — edit yours below.
            </p>
          </div>
        </div>
        <EmailSignatureEditor initial={me?.emailSignature ?? ""} />
      </section>

      <section
        id="ask-buddy"
        className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm"
      >
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-md bg-tbb-blue-50 text-tbb-blue shrink-0">
            <Bot className="w-5 h-5" aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="font-bold text-tbb-navy text-base">
              Ask Buddy &mdash; your Anthropic API key
            </h2>
            <p className="text-xs text-tbb-ink-3">
              Ask Buddy is your in-app assistant. It runs on your own
              Anthropic (Claude) API key, so usage bills to you. Create a key
              at{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-tbb-blue underline"
              >
                console.anthropic.com
              </a>{" "}
              (API keys &rarr; Create key), then paste it below. It is stored
              encrypted and never shown again.
            </p>
          </div>
        </div>
        <AnthropicKeyEditor hasKey={hasAnthropicKey} />
      </section>

      <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-md bg-tbb-blue-50 text-tbb-blue shrink-0">
            <PenTool className="w-5 h-5" aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="font-bold text-tbb-navy text-base">
              E-signature image
            </h2>
            <p className="text-xs text-tbb-ink-3">
              {hasESig
                ? "Image on file — used when auto-signing contracts."
                : "Not uploaded yet. Without one, auto-sign-as-me is disabled."}
            </p>
          </div>
          <Link
            href="/business-builder/templates#e-signature"
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue shrink-0"
          >
            {hasESig ? "Edit" : "Upload"}
            <ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}
