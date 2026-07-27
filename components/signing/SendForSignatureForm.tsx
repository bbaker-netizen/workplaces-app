"use client";

/**
 * Coach-side form for sending a document for native e-signing.
 *
 * Two modes:
 *   - "upload" — no source document exists yet (prospect agreements). The
 *     agreement is built from a saved document template; there is no
 *     upload-a-PDF path, because an agreement should carry the practice's
 *     own wording and signature rather than whatever file is to hand.
 *   - "existing-doc" — pass `sourceDocumentId` for an already-stored
 *     engagement document.
 *
 * Calls `createEnvelopeFromComposed` (upload mode) or
 * `createSignatureEnvelope` (existing-doc mode). Both end with a
 * redirect to the new envelope's detail page.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import {
  createEnvelopeFromComposed,
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

export type SendForSignaturePricingTier = {
  id: string;
  program: string;
  label: string;
  monthlyFeeCents: number;
  scheduleADetail: string | null;
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
      /** Programme tiers from Settings > Pricing tiers. Picking one sets the
       *  fee and supplies the Schedule A wording. */
      pricingTiers?: SendForSignaturePricingTier[];
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Templates are the only way to build an agreement now. The upload-a-PDF
  // path and the tab pair that chose between them are gone: an agreement
  // should come off a controlled template with the practice's own wording
  // and signature already in it, not off whatever file happens to be on
  // someone's desktop. Kept as a constant rather than deleted outright so
  // the compose branches below stay readable.
  const sourceMode = "compose" as const;
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedTierId, setSelectedTierId] = useState<string>("");
  const [composedBody, setComposedBody] = useState<string>("");
  // Compose-time fee override. The variable context's engagement may
  // not have a fee set yet (sending the BBA from a prospect, before
  // an engagement exists). Bruce can type the fee here and we splice
  // it into the variable map so `{{monthly_fee}}` resolves correctly.
  const initialFeeCents =
    props.mode === "upload"
      ? props.variableContext?.engagement?.monthlyFeeCents ?? null
      : null;
  const [feeOverrideInput, setFeeOverrideInput] = useState<string>(
    initialFeeCents !== null && initialFeeCents !== undefined
      ? (initialFeeCents / 100).toFixed(initialFeeCents % 100 === 0 ? 0 : 2)
      : "",
  );
  const tiers = props.mode === "upload" ? (props.pricingTiers ?? []) : [];
  const selectedTier = tiers.find((t) => t.id === selectedTierId) ?? null;
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
    // Splice the compose-time fee override into the variable context
    // if the user has typed one. Lets the BBA render the right fee
    // even before an engagement record exists.
    const feeCentsOverride = parseFeeInputToCents(feeOverrideInput);
    const tier = (props.pricingTiers ?? []).find(
      (t) => t.id === selectedTierId,
    );
    const ctx = props.variableContext
      ? {
          ...props.variableContext,
          // The picked tier drives {{program_name}}, {{program_tier}},
          // {{schedule_a}} and the fee. A typed override still wins over the
          // tier's list price, for a deal priced off-list.
          pricingTier: tier
            ? {
                program: tier.program,
                label: tier.label,
                monthlyFeeCents: feeCentsOverride ?? tier.monthlyFeeCents,
                scheduleADetail: tier.scheduleADetail,
              }
            : null,
          engagement: {
            ...(props.variableContext.engagement ?? {
              name: null,
              type: null,
              startDate: null,
            }),
            monthlyFeeCents:
              feeCentsOverride ??
              props.variableContext.engagement?.monthlyFeeCents ??
              null,
          },
        }
      : null;
    const vars = ctx ? buildVariableMap(ctx) : {};
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
  }, [selectedTemplateId, feeOverrideInput, selectedTierId]);

  /** Parse the dollar-formatted fee input ("2500" / "2500.00") into
   *  cents. Empty / invalid → null. */
  function parseFeeInputToCents(s: string): number | null {
    const trimmed = s.trim();
    if (!trimmed) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
    return Math.round(parseFloat(trimmed) * 100);
  }

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
          autoSignAsMe: false,
          documentTitle: subject.trim(),
          bodyMarkdown: liveBody,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/business-builder/envelopes/${result.data.envelopeId}`);
        return;
      }
      if (props.mode === "upload") {
        // Unreachable: upload mode always composes from a template now, and
        // the branch above returns. Kept as a guard so a future source mode
        // can't fall silently through to the existing-doc path.
        setError("Choose a template to build the agreement from.");
        return;
      } else {
        const result = await createSignatureEnvelope({
          sourceDocumentId: props.sourceDocumentId,
          engagementId: props.engagementId ?? null,
          subject: subject.trim(),
          message: message.trim() || null,
          signers: cleanSigners,
          autoSignAsMe: false,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/business-builder/envelopes/${result.data.envelopeId}`);
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

      {/* No templates yet. The picker still shows, with every other field
          intact, so the shape of the job is visible before anything has been
          set up — and it says plainly what's missing rather than rendering an
          empty dropdown. */}
      {props.mode === "upload" && !composeAvailable && (
        <div className="space-y-2 border border-tbb-line rounded-md bg-white p-4">
          <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Choose from template
          </span>
          <select
            disabled
            className="mt-1 w-full bg-tbb-cream-50 border border-tbb-line rounded-md px-3 py-2 text-sm text-tbb-ink-3"
          >
            <option>— No templates added yet —</option>
          </select>
          <p className="text-xs text-tbb-ink-3">
            Agreements are built from a saved template so the wording and
            your signature are already in place.{" "}
            <Link
              href="/business-builder/templates"
              className="font-bold text-tbb-blue hover:underline"
            >
              Add a document template
            </Link>{" "}
            to get started.
          </p>
        </div>
      )}

      {props.mode === "upload" && composeAvailable && (
        <div className="space-y-3 border border-tbb-line rounded-md bg-white p-4">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
              Choose from template
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
              {/* Programme tier drives the fee AND Schedule A. One choice
                  rather than typing a number and separately remembering what
                  that number is supposed to include. */}
              {tiers.length > 0 && (
                <label className="block">
                  <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                    Programme
                  </span>
                  <select
                    value={selectedTierId}
                    onChange={(e) => setSelectedTierId(e.target.value)}
                    disabled={isPending}
                    className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                  >
                    <option value="">— Choose a programme tier —</option>
                    {(["accelerator", "implementer"] as const).map((prog) => {
                      const group = tiers.filter((t) => t.program === prog);
                      if (group.length === 0) return null;
                      return (
                        <optgroup
                          key={prog}
                          label={
                            prog === "accelerator"
                              ? "Accelerator"
                              : "Implementer"
                          }
                        >
                          {group.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label} — ${(t.monthlyFeeCents / 100).toLocaleString("en-CA")}/month
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  {selectedTier && (
                    <p className="mt-1 text-[11px] text-tbb-ink-3">
                      Sets <code className="font-mono">{`{{monthly_fee}}`}</code>,{" "}
                      <code className="font-mono">{`{{program_name}}`}</code>{" "}
                      and{" "}
                      <code className="font-mono">{`{{schedule_a}}`}</code>.
                      {!selectedTier.scheduleADetail?.trim() && (
                        <span className="block text-tbb-danger mt-0.5">
                          This tier has no Schedule A detail yet — the contract
                          will show a placeholder. Add it under Settings →
                          Pricing tiers.
                        </span>
                      )}
                    </p>
                  )}
                </label>
              )}

              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                  {tiers.length > 0
                    ? "Override the monthly fee (optional)"
                    : "Monthly fee for this deal"}
                </span>
                <div className="relative mt-1">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-tbb-ink-3 pointer-events-none"
                    aria-hidden
                  >
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    inputMode="decimal"
                    value={feeOverrideInput}
                    onChange={(e) => setFeeOverrideInput(e.target.value)}
                    disabled={isPending}
                    placeholder={
                      selectedTier
                        ? String(selectedTier.monthlyFeeCents / 100)
                        : "2500"
                    }
                    className="w-full bg-white border border-tbb-line rounded-md pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                  />
                </div>
                <p className="mt-1 text-[11px] text-tbb-ink-3">
                  {tiers.length > 0
                    ? "Leave blank to use the tier's price. Type a figure only when this deal is priced off-list."
                    : "Fills in {{monthly_fee}} in the doc. Leave blank to keep the placeholder."}
                </p>
              </label>

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

      {/* "Auto-sign as me first" is gone. The agreement is built from a
          template that already carries the practice's signature, so adding
          the sender as an extra order-0 signer signed the same document
          twice and put a redundant name on the certificate of completion. */}

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
          {isPending ? "Sending…" : "Prepare Business Building Agreement"}
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
