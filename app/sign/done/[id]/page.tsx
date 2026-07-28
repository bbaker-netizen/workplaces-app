/**
 * "Everyone has signed" page — the link in the completion email.
 *
 * This route was referenced by `signatureCompletedEmail` from the day the
 * native signing flow shipped, and never existed. A client who signed and
 * then followed the link in their confirmation email got a 404 — the last
 * thing they see in the whole agreement process.
 *
 * Public by design: no Clerk session. Signers are clients and counterparties
 * who have no login. The document id in the URL is a v4 UUID and is only ever
 * emailed to people who were signers on that envelope, which is the same
 * standard the signing link itself works to.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Download } from "lucide-react";
import { getSignedDocumentForCompletionPage } from "@/lib/db/queries/signatures";

export const dynamic = "force-dynamic";

export default async function SigningDonePage({
  params,
}: {
  params: { id: string };
}) {
  const doc = await getSignedDocumentForCompletionPage(params.id);
  if (!doc) notFound();

  return (
    <main className="min-h-screen bg-tbb-cream flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-xl bg-white border border-tbb-line rounded-lg shadow-tbb-sm p-8 space-y-5">
        <div className="flex items-center gap-3">
          <CheckCircle2
            className="w-8 h-8 text-tbb-success shrink-0"
            aria-hidden
          />
          <h1 className="font-bold text-foreground text-xl tracking-tight">
            All signed
          </h1>
        </div>

        <p className="font-sans text-sm text-tbb-ink-2 leading-relaxed">
          Everyone has signed <strong>{doc.envelopeSubject}</strong>. The
          completed copy — including the certificate of completion showing who
          signed, when, and from where — is attached to the confirmation email,
          and you can download it here too.
        </p>

        <a
          href={`/api/sign/done/${params.id}/document`}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
        >
          <Download className="w-4 h-4" aria-hidden />
          Download the signed agreement
        </a>

        <p className="font-sans text-xs text-tbb-ink-3 border-t border-tbb-line-soft pt-4">
          Keep this file — it is the executed agreement. If you need another
          copy later, reply to the confirmation email and we&apos;ll send one.
        </p>

        <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-4">
          <Link href="https://4workplaces.com" className="hover:underline">
            The Builder · By Workplaces
          </Link>
        </p>
      </div>
    </main>
  );
}
