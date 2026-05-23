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

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileSignature,
  FileUp,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import {
  createEnvelopeFromComposed,
  createEnvelopeFromUpload,
  createSignatureEnvelope,
} from "@/lib/actions/signatures";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/communication/RichTextEditor";
import {
  applyDocumentVariables,
  buildVariableMap,
  DOCUMENT_VARIABLES,
  type DocumentVariableContext,
} from "@/lib/signing/document-variables";
import type { DocumentTemplate } from "@/lib/db/schema";

type SignerDraft = {
  name: string;
  email: string;
  roleLabel: string;
};

export type SendForSignatureDocumentTemplate = Pick<
  DocumentTemplate,
  "id" | "name" | "category" | "bodyMarkdown" | "defaultSubject"
>;

type Props =
  | {
      mode: "upload";
      prospectId?: string | null;
      engagementId?: string | null;
      defaultSubject?: string;
      defaultSigners?: SignerDraft[];
      hasStoredSignature: boolean;
      onCancel?: () => void;
      /** Document templates available for "compose" source mode. */
      documentTemplates?: SendForSignatureDocumentTemplate[];
      /** Context for resolving {{variable}} placeholders when a
       *  template is picked. */
      variableContext?: DocumentVariableContext;
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

  // Compose-mode state — only meaningful when props.mode === "upload"
  // (existing-doc already has a source document picked). Defaults to
  // "upload" so the file picker is the first thing the user sees, with
  // the compose path available as a tab.
  const [sourceMode, setSourceMode] = useState<"upload" | "compose">(
    "upload",
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [composedBody, setComposedBody] = useState<string>("");
  const bodyEditorRef = useRef<RichTextEditorHandle | null>(null);
  const composeAvailable =
    props.mode === "upload" &&
    (props.documentTemplates?.length ?? 0) > 0 &&
    !!props.variableContext;

  // When the user picks a template, resolve its body with variables,
  // push to the editor, and seed the subject (if blank) from the
  // template's default. The body may be HTML (new format) or markdown
  // (legacy) — feed the editor via the matching imperative method.
  useEffect(() => {
    if (sourceMode !== "compose") return;
    if (props.mode !== "upload") return;
    if (!selectedTemplateId) return;
    const tpl = props.documentTemplates?.find(
      (t) => t.id === selectedTemplateId,
    );
    if (!tpl) return;
    const vars = props.variableContext
      ? buildVariableMap(props.variableContext)
      : {};
    const resolved = applyDocumentVariables(tpl.bodyMarkdown ?? "", vars);
    setComposedBody(resolved);
    if (resolved.trim().startsWith("<")) {
      bodyEditorRef.current?.setHTML(resolved);
    } else {
      bodyEditorRef.current?.setMarkdown(resolved);
    }
    if (!subject.trim() && tpl.defaultSubject) {
      setSubject(tpl.defaultSubject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId]);

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
      if (props.mode === "upload" && sourceMode === "compose") {
        // Compose-from-template path: render the body (HTML or
        // markdown) to PDF server-side, then run the standard envelope
        // flow. We grab HTML — the renderer auto-detects format.
        const liveBody = bodyEditorRef.current?.getHTML() ?? composedBody;
        if (!liveBody.trim() || liveBody.trim().length < 30) {
          setError(
            "Write or paste the actual document body before sending.",
          );
          return;
        }
        const result = await createEnvelopeFromComposed({
          prospectId: props.prospectId ?? null,
          engagementId: props.engagementId ?? null,
          subject: subject.trim(),
          message: message.trim() || null,
          signers: cleanSigners,
          autoSignAsMe,
          documentTitle: subject.trim(),
          bodyMarkdown: liveBody,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/coach/envelopes/${result.data.envelopeId}`);
        return;
      }
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
        <label className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Subject <span className="text-tbb-danger">*</span>
        </label>
        <input
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={isPending}
          placeholder="Business building agreement"
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
      </div>

      {props.mode === "upload" && composeAvailable && (
        <div
          role="tablist"
          aria-label="Document source"
          className="inline-flex bg-tbb-cream-50 border border-tbb-line rounded-pill p-1 gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === "upload"}
            onClick={() => setSourceMode("upload")}
            className={
              "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill transition-colors " +
              (sourceMode === "upload"
                ? "bg-white text-tbb-navy shadow-tbb-sm"
                : "text-tbb-ink-3 hover:text-tbb-navy")
            }
          >
            <FileUp className="w-3.5 h-3.5" aria-hidden /> Upload PDF
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === "compose"}
            onClick={() => setSourceMode("compose")}
            className={
              "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill transition-colors " +
              (sourceMode === "compose"
                ? "bg-white text-tbb-navy shadow-tbb-sm"
                : "text-tbb-ink-3 hover:text-tbb-navy")
            }
          >
            <FileSignature className="w-3.5 h-3.5" aria-hidden /> Compose
            from template
          </button>
        </div>
      )}

      {props.mode === "upload" && sourceMode === "compose" && composeAvailable && (
        <div className="space-y-3 border border-tbb-line rounded-md bg-white p-4">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
              Pick a template
            </span>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              disabled={isPending}
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            >
              <option value="">— Choose a document template —</option>
              {props.documentTemplates?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          {selectedTemplateId && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                    Document body — edit anything specific to this deal
                  </span>
                  <span className="text-[10px] text-tbb-ink-3">
                    Insert:
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {DOCUMENT_VARIABLES.slice(0, 7).map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() =>
                        bodyEditorRef.current?.insertText(`{{${v.name}}}`)
                      }
                      title={`Insert {{${v.name}}}`}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-tbb-cream-50 text-tbb-blue border border-tbb-line hover:bg-tbb-blue hover:text-white transition-colors"
                    >
                      {`{{${v.name}}}`}
                    </button>
                  ))}
                </div>
                <RichTextEditor
                  initialHtml={
                    composedBody.trim().startsWith("<")
                      ? composedBody
                      : undefined
                  }
                  initialMarkdown={
                    composedBody.trim().startsWith("<")
                      ? undefined
                      : composedBody
                  }
                  richMode
                  outputFormat="html"
                  placeholder="Document body…"
                  disabled={isPending}
                  editorRef={bodyEditorRef}
                  onChange={setComposedBody}
                  ariaLabel="Document body"
                />
                <p className="mt-2 text-[11px] text-tbb-ink-3">
                  We&apos;ll render this as a Workplaces-branded PDF when
                  you send. Variables that still look like{" "}
                  <code className="font-mono">{`{{name}}`}</code> at send
                  time are missing data — fill them in or remove them
                  before clicking send.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {props.mode === "upload" && sourceMode === "upload" && (
        <div className="space-y-1">
          <label className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Document <span className="text-tbb-danger">*</span>
          </label>
          <input
            ref={fileInputRef}
            required={sourceMode === "upload"}
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
        <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Sending the document already stored for this engagement.
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground mb-1">
          Signers (sequential — first signer goes first)
        </legend>
        <div className="space-y-3">
          {signers.map((s, i) => (
            <div
              key={i}
              className="border border-tbb-line rounded-md bg-white p-3 space-y-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                  Signer {i + 1}
                </span>
                {signers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSigner(i)}
                    disabled={isPending}
                    className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-danger hover:underline inline-flex items-center gap-1"
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
                  className="bg-white border border-tbb-line rounded-md px-3 py-1.5 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                />
                <input
                  required
                  type="email"
                  value={s.email}
                  onChange={(e) => updateSigner(i, "email", e.target.value)}
                  disabled={isPending}
                  placeholder="email@company.com"
                  className="bg-white border border-tbb-line rounded-md px-3 py-1.5 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                />
                <input
                  value={s.roleLabel}
                  onChange={(e) =>
                    updateSigner(i, "roleLabel", e.target.value)
                  }
                  disabled={isPending}
                  placeholder="Role (e.g. CEO, Founder)"
                  className="bg-white border border-tbb-line rounded-md px-3 py-1.5 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue sm:col-span-2"
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
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-navy hover:underline"
          >
            <Plus className="w-3 h-3" aria-hidden /> Add signer
          </button>
        )}
      </fieldset>

      <div className="space-y-1">
        <label className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Message (optional)
        </label>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isPending}
          placeholder="A short note that appears in the signing email."
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
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
            <span className="block font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground mt-0.5">
              Upload a signature image at /coach/profile/signature to enable.
            </span>
          )}
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
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
            className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
