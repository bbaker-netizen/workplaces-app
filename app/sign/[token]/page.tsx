/**
 * Public signing page — Phase 4.5.
 *
 * No Clerk auth. The token in the URL identifies the signer. We render
 * the document inline (via iframe / object), capture the signature, and
 * submit through the public `submitSignature` server action.
 */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getEnvelopeByToken } from "@/lib/db/queries/signatures";
import { markSigningLinkViewed } from "@/lib/actions/signatures";
import { SignaturePanel } from "@/components/signing/SignaturePanel";

export const dynamic = "force-dynamic";

export default async function SigningPage({
  params,
}: {
  params: { token: string };
}) {
  const data = await getEnvelopeByToken(params.token);
  if (!data) notFound();

  // Capture viewed event with IP / user-agent. Best-effort.
  const hdrs = headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    null;
  const userAgent = hdrs.get("user-agent") ?? null;
  await markSigningLinkViewed(params.token, ip, userAgent);

  const isCompleted = data.envelopeStatus === "completed";
  const isVoided = data.envelopeStatus === "voided";
  const alreadySigned = data.signer.status === "signed";

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            The Builder · By Workplaces
          </p>
          <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
            {data.envelopeSubject}
          </h1>
          <p className="font-sans text-sm text-foreground">
            For: <strong>{data.signer.name}</strong>
            {data.signer.roleLabel && (
              <span className="text-muted-foreground">
                {" · "}
                {data.signer.roleLabel}
              </span>
            )}
          </p>
        </header>

        {data.envelopeMessage && (
          <div className="border-l-4 border-tbb-blue bg-tbb-cream-50 px-4 py-3">
            <p className="font-sans text-sm text-foreground italic whitespace-pre-line">
              {data.envelopeMessage}
            </p>
          </div>
        )}

        {/* State banner */}
        {isVoided && (
          <Banner
            tone="warn"
            title="This signing request was cancelled."
            body="The sender has voided this envelope. Reach out to them directly if you have questions."
          />
        )}
        {isCompleted && (
          <Banner
            tone="success"
            title="Already signed."
            body="Every signer has completed this document. The signed copy was emailed to you. You can close this page."
          />
        )}
        {!isCompleted && !isVoided && alreadySigned && (
          <Banner
            tone="success"
            title="You've signed."
            body="Thanks. We're waiting on the other signers to complete. You'll receive the signed copy by email when everyone is done."
          />
        )}
        {!isCompleted && !isVoided && !alreadySigned && !data.isYourTurn && (
          <Banner
            tone="warn"
            title="Not your turn yet."
            body="The previous signer hasn't completed. We'll email you when it's your turn."
          />
        )}

        {/* Document preview. Use an <object> with a PDF type — works
            for browser-rendered PDFs. For non-PDFs, fall through to
            a download link. */}
        <section className="border border-tbb-line rounded-md overflow-hidden bg-white">
          <header className="px-4 py-2 border-b border-tbb-line flex items-center justify-between gap-3 flex-wrap">
            <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
              Document
            </p>
            <a
              href={`/api/sign/${params.token}/document`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-navy hover:underline underline-offset-4"
            >
              Open in new tab ↗
            </a>
          </header>
          {data.sourceDocument.fileType.startsWith("application/pdf") ? (
            <object
              data={`/api/sign/${params.token}/document`}
              type="application/pdf"
              className="w-full"
              style={{ height: "70vh", minHeight: 480 }}
            >
              <p className="p-6 font-sans text-sm text-muted-foreground">
                Your browser can&apos;t embed this PDF.{" "}
                <a
                  href={`/api/sign/${params.token}/document`}
                  className="text-tbb-navy underline"
                >
                  Download to review
                </a>
                .
              </p>
            </object>
          ) : (
            <div className="p-6">
              <p className="font-sans text-sm text-foreground">
                Source file: <strong>{data.sourceDocument.originalFilename}</strong>
              </p>
              <a
                href={`/api/sign/${params.token}/document`}
                className="mt-3 inline-block font-sans text-sm text-tbb-navy underline underline-offset-4"
              >
                Download to review →
              </a>
            </div>
          )}
        </section>

        {!isCompleted && !isVoided && !alreadySigned && data.isYourTurn && (
          <SignaturePanel
            token={params.token}
            signerName={data.signer.name}
          />
        )}

        <footer className="pt-4 border-t border-tbb-line">
          <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
            Signed electronically. By submitting your signature, you agree to
            do business electronically per the US ESIGN Act, Canadian PIPEDA,
            and Alberta Electronic Transactions Act. Your IP, browser, and
            timestamp are recorded as part of the audit trail.
          </p>
        </footer>
      </div>
    </main>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "success" | "warn";
  title: string;
  body: string;
}) {
  const color = tone === "success" ? "#2E4057" : "#E87722";
  return (
    <div
      className="border rounded-md px-4 py-3 bg-white"
      style={{ borderColor: color }}
    >
      <p
        className="font-bold tracking-tight text-lg"
        style={{ color }}
      >
        {title}
      </p>
      <p className="font-sans text-sm text-foreground mt-1">{body}</p>
    </div>
  );
}
