"use client";

import Link from "next/link";
import { useState } from "react";
import { Send } from "lucide-react";
import {
  SendForSignatureForm,
  type SendForSignatureDocumentTemplate,
} from "@/components/signing/SendForSignatureForm";
import type { DocumentVariableContext } from "@/lib/signing/document-variables";

type EnvelopeRow = {
  id: string;
  subject: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
};

const STATUS_TONE: Record<string, string> = {
  in_progress: "#666666",
  completed: "#2E4057",
  voided: "#E87722",
};

export function ProspectEnvelopeSection({
  prospectId,
  defaultSignerName,
  defaultSignerEmail,
  envelopes,
  hasStoredSignature,
  documentTemplates,
  variableContext,
}: {
  prospectId: string;
  defaultSignerName: string;
  defaultSignerEmail: string;
  envelopes: EnvelopeRow[];
  hasStoredSignature: boolean;
  documentTemplates?: SendForSignatureDocumentTemplate[];
  variableContext?: DocumentVariableContext;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="border border-tbb-line rounded-md bg-white p-5 space-y-4">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Signing
        </h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
          >
            <Send className="w-3 h-3" aria-hidden /> Send for signature
          </button>
        )}
      </header>

      {showForm && (
        <div className="border-t border-tbb-line pt-4">
          <SendForSignatureForm
            mode="upload"
            prospectId={prospectId}
            defaultSubject="Business building agreement"
            defaultSigners={
              defaultSignerEmail
                ? [
                    {
                      name: defaultSignerName,
                      email: defaultSignerEmail,
                      roleLabel: "",
                    },
                  ]
                : undefined
            }
            hasStoredSignature={hasStoredSignature}
            documentTemplates={documentTemplates}
            variableContext={variableContext}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {envelopes.length > 0 && (
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
            Past envelopes
          </p>
          <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
            {envelopes.map((e) => (
              <li
                key={e.id}
                className="py-2 flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
              >
                <Link
                  href={`/business-builder/envelopes/${e.id}`}
                  className="font-sans text-sm font-bold text-foreground hover:underline underline-offset-4"
                >
                  {e.subject}
                </Link>
                <span
                  className="font-mono text-[10px] uppercase tracking-tbb-caps font-bold"
                  style={{ color: STATUS_TONE[e.status] ?? "#666666" }}
                >
                  {e.status.replace(/_/g, " ")}
                </span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {(e.completedAt ?? e.createdAt).toLocaleDateString(
                    undefined,
                    {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    },
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
