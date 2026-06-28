/**
 * QuickBooks diagnostics — master-admin only.
 *
 * Turns a persistent `ApplicationAuthorizationFailed (3100)` into a
 * definitive root cause. Reports the runtime QBO environment/base URL, the
 * client-ID tail (to confirm Netlify holds the PRODUCTION keys), the
 * registered redirect URI, the stored token state, and the raw result of a
 * live CompanyInfo call (status + intuit_tid + body). Read-only.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  getValidQboCredentials,
  qboApiBase,
  qboCompanyInfoProbe,
} from "@/lib/integrations/qbo";

export const dynamic = "force-dynamic";

function tail(v: string | undefined, n = 6): string {
  if (!v) return "(not set)";
  return v.length <= n ? v : "…" + v.slice(-n);
}

export default async function QboDiagnosticsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin") redirect("/business-builder");

  const env = process.env.QBO_ENVIRONMENT ?? "(unset → production)";
  const base = qboApiBase();
  const redirectUri = process.env.QBO_REDIRECT_URI ?? "(not set)";
  const clientIdTail = tail(process.env.QBO_CLIENT_ID);

  let tokenLine = "No stored token — connect first.";
  let refreshError: string | null = null;
  let realmId: string | null = null;
  let probe: {
    status: number;
    intuitTid: string | null;
    bodySnippet: string;
  } | null = null;

  try {
    const creds = await getValidQboCredentials(profile.userProfileId);
    if (creds) {
      realmId = creds.realmId;
      tokenLine = `Token resolved. Realm ID ${creds.realmId}.`;
      try {
        probe = await qboCompanyInfoProbe(creds.accessToken, creds.realmId);
      } catch (e) {
        refreshError = `CompanyInfo call threw: ${
          e instanceof Error ? e.message : String(e)
        }`;
      }
    }
  } catch (e) {
    refreshError = `Token resolve/refresh failed: ${
      e instanceof Error ? e.message : String(e)
    }`;
  }

  const verdict = (() => {
    if (refreshError) {
      return "Token refresh failed — the stored token was almost certainly minted under different Intuit keys than Netlify currently holds. Fix the keys, then Disconnect + Reconnect.";
    }
    if (!probe) return "No probe ran — connect QuickBooks first.";
    if (probe.status === 200)
      return "Healthy. CompanyInfo returned 200 — QuickBooks reads are working.";
    if (probe.bodySnippet.includes("3100") || probe.status === 403)
      return "ApplicationAuthorizationFailed (403/3100): the access token is not valid for the app keys/environment being used. Compare the Client-ID tail below to your Intuit PRODUCTION app Client ID, and confirm the API base matches your company (production company → production base). Then Disconnect + Reconnect.";
    return `Unexpected status ${probe.status}. See the raw body below.`;
  })();

  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5 border-b border-tbb-line-soft">
      <dt className="text-tbb-ink-3 text-xs uppercase tracking-tbb-caps font-bold">
        {k}
      </dt>
      <dd className="text-tbb-navy text-sm break-all">{v}</dd>
    </div>
  );

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <Link
        href="/business-builder/profile/quickbooks"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
      >
        <ArrowLeft className="w-3 h-3" aria-hidden /> QuickBooks
      </Link>
      <header className="space-y-1">
        <p className="tbb-eyebrow">Diagnostics</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          QuickBooks connection diagnostics
        </h1>
        <p className="text-sm text-tbb-ink-3">
          Read-only. Pinpoints why QuickBooks data calls fail.
        </p>
      </header>

      <section className="border border-tbb-blue rounded-lg bg-tbb-blue-50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue mb-1">
          Verdict
        </p>
        <p className="text-sm text-tbb-navy">{verdict}</p>
      </section>

      <section className="border border-tbb-line rounded-lg bg-white p-5 shadow-tbb-sm">
        <dl>
          <Row k="QBO_ENVIRONMENT" v={env} />
          <Row k="API base" v={base} />
          <Row k="Client ID tail" v={clientIdTail} />
          <Row k="Redirect URI" v={redirectUri} />
          <Row k="Token" v={tokenLine} />
          {realmId && <Row k="Realm ID" v={realmId} />}
          {refreshError && <Row k="Error" v={refreshError} />}
          {probe && <Row k="CompanyInfo status" v={String(probe.status)} />}
          {probe?.intuitTid && <Row k="intuit_tid" v={probe.intuitTid} />}
        </dl>
        {probe && (
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 mb-1">
              Raw Intuit response
            </p>
            <pre className="text-xs bg-tbb-cream-50 border border-tbb-line rounded p-3 overflow-x-auto whitespace-pre-wrap">
              {probe.bodySnippet}
            </pre>
          </div>
        )}
      </section>

      <p className="text-xs text-tbb-ink-3">
        Tip: the Client-ID tail must match the last characters of your Intuit
        app&apos;s <strong>Production</strong> Client ID (developer.intuit.com
        &rarr; your app &rarr; Keys &amp; credentials &rarr; Production). If it
        matches your Development Client ID instead, Netlify is still serving
        development keys, which Intuit blocks against real companies with this
        exact 3100 error.
      </p>
    </main>
  );
}
