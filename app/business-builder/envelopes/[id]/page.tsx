/**
 * Envelope detail — Phase 4.5. Coach view of a signature envelope.
 * Shows status per signer, audit log, source + signed document links,
 * and a void button while in_progress.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getEnvelopeForCoach } from "@/lib/db/queries/signatures";
import { EnvelopeActions } from "@/components/signing/EnvelopeActions";
import type { AuditEntry } from "@/lib/signing/audit";

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  in_progress: { label: "In progress", tone: "#2E4057" },
  completed: { label: "Completed", tone: "#2E4057" },
  voided: { label: "Voided", tone: "#E87722" },
};

const SIGNER_STATUS: Record<string, string> = {
  pending: "Pending",
  viewed: "Viewed",
  signed: "Signed",
  declined: "Declined",
};

export default async function EnvelopeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const env = await getEnvelopeForCoach(params.id);
  if (!env) notFound();

  const status = STATUS_COPY[env.status] ?? {
    label: env.status,
    tone: "#666666",
  };
  const audit = (env.auditLog as AuditEntry[]) ?? [];

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/business-builder/pipeline"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← Pipeline
        </Link>
        <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Signature envelope
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {env.subject}
        </h1>
        <p
          className="font-mono text-xs uppercase tracking-tbb-caps"
          style={{ color: status.tone }}
        >
          {status.label}
        </p>
      </header>

      <section className="border border-tbb-line rounded-md bg-white p-5 space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Documents
        </h2>
        {env.sourceDocument && (
          <p className="font-sans text-sm text-foreground">
            <strong>Source:</strong>{" "}
            <a
              href={`/api/documents/${env.sourceDocument.id}/download`}
              className="text-tbb-navy underline underline-offset-4"
            >
              {env.sourceDocument.originalFilename}
            </a>
          </p>
        )}
        {env.signedDocument ? (
          <p className="font-sans text-sm text-foreground">
            <strong>Signed:</strong>{" "}
            <a
              href={`/api/documents/${env.signedDocument.id}/download`}
              className="text-tbb-navy underline underline-offset-4"
            >
              {env.signedDocument.originalFilename}
            </a>
          </p>
        ) : (
          <p className="font-sans text-sm text-muted-foreground italic">
            Signed copy not yet generated.
          </p>
        )}
      </section>

      <section className="border border-tbb-line rounded-md bg-white p-5 space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Signers
        </h2>
        <ul className="divide-y divide-tbb-line">
          {env.signers.map((s) => (
            <li
              key={s.id}
              className="py-3 flex items-baseline gap-x-3 gap-y-1 flex-wrap"
            >
              <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground w-6">
                {s.orderIndex + 1}
              </span>
              <span className="font-sans text-sm font-bold text-foreground">
                {s.name}
              </span>
              {s.roleLabel && (
                <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                  {s.roleLabel}
                </span>
              )}
              <span className="font-mono text-[10px] text-muted-foreground">
                {s.email}
              </span>
              <span
                className="ml-auto font-mono text-[10px] uppercase tracking-tbb-caps font-bold"
                style={{
                  color:
                    s.status === "signed"
                      ? "#2E4057"
                      : s.status === "declined"
                        ? "#E87722"
                        : "#666666",
                }}
              >
                {SIGNER_STATUS[s.status] ?? s.status}
              </span>
              {s.signedAt && (
                <span className="w-full font-mono text-[10px] text-muted-foreground pl-9">
                  Signed{" "}
                  {s.signedAt.toLocaleString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {s.signerIp ? ` · IP ${s.signerIp}` : ""}
                  {s.signatureMethod ? ` · ${s.signatureMethod}` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-tbb-line rounded-md bg-white p-5 space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Audit log
        </h2>
        {audit.length === 0 ? (
          <p className="font-sans text-sm text-muted-foreground italic">
            No events yet.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {audit.map((e, i) => (
              <li
                key={i}
                className="font-mono text-[11px] text-foreground flex items-baseline gap-2 flex-wrap"
              >
                <span className="text-muted-foreground tabular-nums">
                  {new Date(e.at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span>{e.event}</span>
                {e.signerEmail && (
                  <span className="text-muted-foreground">
                    {e.signerEmail}
                  </span>
                )}
                {e.ip && (
                  <span className="text-muted-foreground">IP {e.ip}</span>
                )}
                {e.by && (
                  <span className="text-muted-foreground">by {e.by}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {env.status === "in_progress" && <EnvelopeActions envelopeId={env.id} />}
    </main>
  );
}
