/**
 * QuickBooks Online connection page.
 *
 * Phase 4.6. Coach lands here to connect / disconnect their QBO
 * company file. After a successful connection Intuit redirects back
 * with `?connected=1`; on errors it bounces here with `?error=...`.
 */

import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { qboOauthTokens } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { QuickBooksConnectButton } from "@/components/qbo/QuickBooksConnectButton";
import { QuickBooksSyncValuesButton } from "@/components/qbo/QuickBooksSyncValuesButton";

const ERROR_LABELS: Record<string, string> = {
  state_mismatch:
    "Authentication mismatch. Try connecting again from this page.",
  not_authenticated: "Sign in first, then try again.",
  not_a_coach: "Only coaches can connect QuickBooks.",
  missing_params: "QuickBooks didn't return the expected response.",
};

export default async function QboProfilePage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const stored = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        realmId: qboOauthTokens.realmId,
        companyName: qboOauthTokens.companyName,
        expiresAt: qboOauthTokens.expiresAt,
        refreshExpiresAt: qboOauthTokens.refreshExpiresAt,
      })
      .from(qboOauthTokens)
      .where(eq(qboOauthTokens.coachUserProfileId, profile.userProfileId))
      .limit(1);
    return row ?? null;
  });

  const justConnected = searchParams.connected === "1";
  const errorCode = searchParams.error ?? null;
  const errorLabel = errorCode
    ? ERROR_LABELS[errorCode] ?? decodeURIComponent(errorCode)
    : null;

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          QuickBooks Online
        </h1>
        <p className="font-sans text-sm text-foreground">
          Connect your QBO company file once. After that, every invoice
          you create in The Builder defaults to QBO and syncs back here
          for status updates.
        </p>
        <Link
          href="/business-builder"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← Console
        </Link>
      </header>

      {justConnected && (
        <div className="border border-tbb-blue bg-tbb-cream-50 rounded-md px-4 py-3">
          <p className="font-bold text-foreground text-lg">
            Connected.
          </p>
          <p className="font-sans text-sm text-foreground">
            QuickBooks is now linked. You can create invoices from any
            engagement and they&apos;ll show up in QBO automatically.
          </p>
        </div>
      )}

      {errorLabel && (
        <div className="border border-tbb-danger bg-white rounded-md px-4 py-3">
          <p className="font-bold text-tbb-danger text-base">
            Couldn&apos;t connect.
          </p>
          <p className="font-sans text-sm text-foreground">{errorLabel}</p>
        </div>
      )}

      <section className="border border-tbb-line rounded-md bg-white p-5 space-y-4">
        <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Connection status
        </h2>

        {stored ? (
          <div className="space-y-3">
            <div>
              <p className="font-sans text-sm text-foreground">
                <strong>Connected.</strong>
              </p>
              <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                Realm ID: {stored.realmId}
              </p>
              <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                Refresh token expires{" "}
                {stored.refreshExpiresAt.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
            <QuickBooksConnectButton mode="reconnect" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-sans text-sm text-muted-foreground italic">
              Not connected yet.
            </p>
            <QuickBooksConnectButton mode="connect" />
          </div>
        )}
      </section>

      {stored && (
        <section className="border border-tbb-line rounded-md bg-white p-5 space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Client value sync
          </h2>
          <p className="font-sans text-sm text-foreground">
            The Pipeline &ldquo;Value&rdquo; column shows each client&apos;s
            lifetime payments received from QuickBooks. It refreshes
            automatically every night — or sync it now to update
            immediately.
          </p>
          <QuickBooksSyncValuesButton />
        </section>
      )}

      <section className="border border-tbb-line rounded-md bg-white p-4 space-y-2">
        <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Heads up
        </h2>
        <ul className="font-sans text-sm text-foreground space-y-1 list-disc pl-5">
          <li>
            QBO refresh tokens expire after 100 days of inactivity. If
            it lapses, just reconnect — no data is lost.
          </li>
          <li>
            For the rare invoices you&apos;d rather run through Stripe, the
            invoice form has a provider toggle. QBO is the default.
          </li>
          <li>
            Status changes you make in QBO (mark paid, void, etc.)
            mirror back here automatically via webhook.
          </li>
        </ul>
      </section>
    </main>
  );
}
