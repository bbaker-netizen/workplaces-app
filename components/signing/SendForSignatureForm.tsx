"use client";

/**
 * Coach-side form for sending a document for native e-signing.
 *
 * Two modes:
 *   - "upload" — the source PDF doesn't exist yet (prospect contracts).
 *     Coach uploads a file, fills signers, sends.
 *   - "existing-doc" — pass `sourceDocumentId` for an already-stored
 *     engagement document.
 *
 * Calls `createEnvelopeFromUpload` (upload mode) or
 * `createSignatureEnvelope` (existing-doc mode). Both end with a
 * redirect to the new envelope's detail page.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import {
  createEnvelopeFromUpload,
  createSignatureEnvelope,
} from "@/lib/actions/signatures";

type SignerDraft = {
  name: string;
  email: string;
  roleLabel: string;
};

type Props =
  | {
      mode: "upload";
      prospectId?: string | null;
      engagementId?: string | null;
      defaultSubject?: string;
      defaultSigners?: SignerDraft[];
      hasStoredSignature: boolean;
      onCancel?: () => void;
    }
  | {
      mode: "existing-doc";
      sourceDocumentId: string;
      engagementId?: string | null;
      defaultSubject?: string;
      defaultSigners?: SignerDraft[];
      hasStoredSignature: boolean;
      onCancel?: () => void;
    };

export function SendForSignatureForm(props: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState(props.defaultSubject ?? "");
  const [message, setMessage] = useState("");
  const [signers, setSigners] = useState<SignerDraft[]>(
    props.defaultSigners && props.defaultSigners.length > 0
      ? props.defaultSigners
      : [{ name: "", email: "", roleLabel: "" }],
  );
  const [autoSignAsMe, setAutoSignAsMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);

  function addSigner() {
    if (signers.length >= 4) return;
    setSigners([...signers, { name: "", email: "", roleLabel: "" }]);
  }
  function removeSigner(idx: number) {
    if (signers.length <= 1) return;
    setSigners(signers.filter((_, i) => i !== idx));
  }
  function updateSigner(idx: number, key: keyof SignerDraft, value: string) {
    setSigners(
      signers.map((s, i) => (i === idx ? { ...s, [key]: value } : s)),
    );
  }

  function validateSigners(): string | null {
    for (let i = 0; i < signers.length; i++) {
      const s = signers[i];
      if (!s.name.trim()) return `Signer ${i + 1} needs a name.`;
      if (!s.email.trim() || !/.+@.+\..+/.test(s.email))
        return `Signer ${i + 1} needs a valid email.`;
    }
    return null;
  }

  function submit() {
    setError(null);
    if (!subject.trim()) {
      setError("Add a subject — what are they signing?");
      return;
    }
    const sErr = validateSigners();
    if (sErr) {
      setError(sErr);
      return;
    }
    const cleanSigners = signers.map((s) => ({
      name: s.name.trim(),
      email: s.email.trim(),
      roleLabel: s.roleLabel.trim() || null,
    }));

    startTransition(async () => {
      if (props.mode === "upload") {
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
          setError("Pick the document file.");
          return;
        }
        const fd = new FormData();
        fd.set("file", file);
        fd.set("subject", subject.trim());
        fd.set("message", message.trim());
        fd.set("signersJson", JSON.stringify(cleanSigners));
        if (props.prospectId) fd.set("prospectId", props.prospectId);
        if (props.engagementId) fd.set("engagementId", props.engagementId);
        fd.set("autoSignAsMe", autoSignAsMe ? "true" : "false");
        const result = await createEnvelopeFromUpload(fd);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/coach/envelopes/${result.data.envelopeId}`);
      } else {
        const result = await createSignatureEnvelope({
          sourceDocumentId: props.sourceDocumentId,
          engagementId: props.engagementId ?? null,
          subject: subject.trim(),
          message: message.trim() || null,
          signers: cleanSigners,
          autoSignAsMe,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/coach/envelopes/${result.data.envelopeId}`);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
      aria-busy={isPending}
    >
      <div className="space-y-1">
        <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Subject <span className="text-[#E87722]">*</span>
        </label>
        <input
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={isPending}
          placeholder="Coaching engagement agreement"
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
        />
      </div>

      {props.mode === "upload" && (
        <div className="space-y-1">
          <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Document <span className="text-[#E87722]">*</span>
          </label>
          <input
            ref={fileInputRef}
            required
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) =>
              setPickedFileName(e.target.files?.[0]?.name ?? null)
            }
            disabled={isPending}
            className="block w-full font-sans text-sm"
          />
          {pickedFileName && (
            <p className="font-mono text-[10px] text-muted-foreground">
              {pickedFileName}
            </p>
          )}
        </div>
      )}

      {props.mode === "existing-doc" && (
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Sending the document already stored for this engagement.
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">
          Signers (sequential — first signer goes first)
        </legend>
        <div className="space-y-3">
          {signers.map((s, i) => (
            <div
              key={i}
              className="border border-[#CCCCCC] rounded-md bg-white p-3 space-y-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Signer {i + 1}
                </span>
                {signers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSigner(i)}
                    disabled={isPending}
                    className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#E87722] hover:underline inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden /> Remove
                  </button>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <input
                  required
                  value={s.name}
                  onChange={(e) => updateSigner(i, "name", e.target.value)}
                  disabled={isPending}
                  placeholder="Full name"
                  className="bg-white border border-[#CCCCCC] rounded-md px-3 py-1.5 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
                />
                <input
                  required
                  type="email"
                  value={s.email}
                  onChange={(e) => updateSigner(i, "email", e.target.value)}
                  disabled={isPending}
                  placeholder="email@company.com"
                  className="bg-white border border-[#CCCCCC] rounded-md px-3 py-1.5 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
                />
                <input
                  value={s.roleLabel}
                  onChange={(e) =>
                    updateSigner(i, "roleLabel", e.target.value)
                  }
                  disabled={isPending}
                  placeholder="Role (e.g. CEO, Founder)"
                  className="bg-white border border-[#CCCCCC] rounded-md px-3 py-1.5 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057] sm:col-span-2"
                />
              </div>
            </div>
          ))}
        </div>
        {signers.length < 4 && (
          <button
            type="button"
            onClick={addSigner}
            disabled={isPending}
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.15em] text-[#2E4057] hover:underline"
          >
            <Plus className="w-3 h-3" aria-hidden /> Add signer
          </button>
        )}
      </fieldset>

      <div className="space-y-1">
        <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Message (optional)
        </label>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isPending}
          placeholder="A short note that appears in the signing email."
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057] resize-y"
        />
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={autoSignAsMe}
          onChange={(e) => setAutoSignAsMe(e.target.checked)}
          disabled={isPending || !props.hasStoredSignature}
          className="mt-1"
        />
        <span className="font-sans text-sm text-foreground">
          Auto-sign as me first
          {!props.hasStoredSignature && (
            <span className="block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-0.5">
              Upload a signature image at /coach/profile/signature to enable.
            </span>
          )}
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <Send className="w-4 h-4" aria-hidden />
          )}
          {isPending ? "Sending…" : "Send for signature"}
        </button>
        {props.onCancel && (
          <button
            type="button"
            onClick={props.onCancel}
            disabled={isPending}
            className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
