"use client";

/**
 * Engagement-side "send a document for signature" panel.
 *
 * Shows a select for an existing engagement document, plus the shared
 * SendForSignatureForm in existing-doc mode. Used on coach + portal
 * documents pages so a coach can send any uploaded file without
 * re-uploading it.
 */

import Link from "next/link";
import { useState } from "react";
import { Send } from "lucide-react";
import { SendForSignatureForm } from "./SendForSignatureForm";

type DocumentChoice = {
  id: string;
  filename: string;
};

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

export function DocumentSigningPanel({
  engagementId,
  documents,
  envelopes,
  hasStoredSignature,
}: {
  engagementId: string;
  documents: DocumentChoice[];
  envelopes: EnvelopeRow[];
  hasStoredSignature: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [pickedDocId, setPickedDocId] = useState<string>(
    documents[0]?.id ?? "",
  );

  return (
    <section className="border border-[#CCCCCC] rounded-md bg-white p-5 space-y-4">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Send a document for signature
        </h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            disabled={documents.length === 0}
            className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50"
          >
            <Send className="w-3 h-3" aria-hidden /> Send
          </button>
        )}
      </header>

      {documents.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground italic">
          Upload a document above first, then come back here to send it.
        </p>
      ) : showForm ? (
        <div className="border-t border-[#CCCCCC] pt-4 space-y-4">
          <div className="space-y-1">
            <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Pick the document
            </label>
            <select
              value={pickedDocId}
              onChange={(e) => setPickedDocId(e.target.value)}
              className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename}
                </option>
              ))}
            </select>
          </div>

          {pickedDocId && (
            <SendForSignatureForm
              key={pickedDocId}
              mode="existing-doc"
              sourceDocumentId={pickedDocId}
              engagementId={engagementId}
              hasStoredSignature={hasStoredSignature}
              onCancel={() => setShowForm(false)}
            />
          )}
        </div>
      ) : null}

      {envelopes.length > 0 && (
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Envelopes for this engagement
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
