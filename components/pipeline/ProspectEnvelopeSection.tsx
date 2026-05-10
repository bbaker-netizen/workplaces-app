"use client";

import Link from "next/link";
import { useState } from "react";
import { Send } from "lucide-react";
import { SendForSignatureForm } from "@/components/signing/SendForSignatureForm";

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
}: {
  prospectId: string;
  defaultSignerName: string;
  defaultSignerEmail: string;
  envelopes: EnvelopeRow[];
  hasStoredSignature: boolean;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="border border-[#CCCCCC] rounded-md bg-white p-5 space-y-4">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Signing
        </h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057]"
          >
            <Send className="w-3 h-3" aria-hidden /> Send for signature
          </button>
        )}
      </header>

      {showForm && (
        <div className="border-t border-[#CCCCCC] pt-4">
          <SendForSignatureForm
            mode="upload"
            prospectId={prospectId}
            defaultSubject="Coaching engagement agreement"
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
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {envelopes.length > 0 && (
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Past envelopes
          </p>
          <ul className="divide-y divide-[#CCCCCC] border-t border-b border-[#CCCCCC]">
            {envelopes.map((e) => (
              <li
                key={e.id}
                className="py-2 flex items-baseline gap-x-3 gap-y-0.5 flex-wrap"
              >
                <Link
                  href={`/coach/envelopes/${e.id}`}
                  className="font-sans text-sm font-bold text-foreground hover:underline underline-offset-4"
                >
                  {e.subject}
                </Link>
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.15em] font-bold"
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
