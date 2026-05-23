"use client";

/**
 * DocumentTemplatesManager — CRUD UI for the bodies used by the native
 * signing compose flow. Sibling of TemplatesManager (which handles
 * email templates), with a slightly different shape: documents carry a
 * body but no subject (the subject is set per-send when Bruce actually
 * fires the envelope).
 *
 * List on the left, editor on the right. The editor now runs in rich
 * mode (headings, underline, alignment, blockquote) and emits HTML so
 * alignment and blank-line spacing round-trip exactly. The body column
 * (`document_templates.body_markdown`) holds either markdown (legacy)
 * or HTML (new) — the PDF renderer auto-detects which.
 *
 * Variable chips at the top of the editor insert tokens at the cursor
 * (`{{client_name}}`, `{{company_name}}`, `{{today}}`, etc.).
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileSignature,
  FileUp,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  createDocumentTemplate,
  deleteDocumentTemplate,
  updateDocumentTemplate,
} from "@/lib/actions/document-templates";
import { convertDocumentToTemplate } from "@/lib/actions/convert-document-to-template";
import {
  DOCUMENT_TEMPLATE_CATEGORIES,
  DOCUMENT_VARIABLES,
} from "@/lib/signing/document-variables";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/communication/RichTextEditor";
import type { DocumentTemplate } from "@/lib/db/schema";

const CATEGORY_LABELS: Record<string, string> = {
  contract: "Contract",
  proposal: "Proposal",
  nda: "NDA",
  renewal: "Renewal",
  other: "Other",
};

type Draft = {
  id: string | null;
  name: string;
  category: string;
  bodyMarkdown: string;
  defaultSubject: string;
};

const NEW_DRAFT: Draft = {
  id: null,
  name: "",
  category: "contract",
  bodyMarkdown: `<h1 style="text-align: center">Business Building Agreement</h1>
<p>This agreement is between <strong>{{sender_full_name}}</strong> (Workplaces) and <strong>{{company_name}}</strong> ({{client_full_name}}), effective {{start_date}}.</p>
<h2>Scope</h2>
<p>We'll deliver a structured Business Building engagement with twice-monthly sessions, a focused set of deliverables (SOPs, org charts, financial dashboards, hiring frameworks), and ongoing access to the Workplaces methodology and tools.</p>
<h2>Term</h2>
<p>This engagement begins on {{start_date}} and continues until either party provides 30 days' written notice.</p>
<h2>Fees</h2>
<ul>
<li>Monthly fee: <strong>[$ amount]</strong></li>
<li>Billed: [QuickBooks / Stripe]</li>
<li>First payment due: {{start_date}}</li>
</ul>
<h2>Acknowledgements</h2>
<p>By signing below, both parties confirm they understand the scope, term, and fees outlined above.</p>`,
  defaultSubject: "Business building agreement",
};

function looksLikeHtml(s: string): boolean {
  return s.trim().startsWith("<");
}

export function DocumentTemplatesManager({
  initialTemplates,
}: {
  initialTemplates: DocumentTemplate[];
}) {
  const router = useRouter();
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importingFilename, setImportingFilename] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!draft) return;
    // The body is either HTML (new format) or markdown (legacy). Push
    // it into the editor via the matching imperative method so initial
    // load works for both.
    if (looksLikeHtml(draft.bodyMarkdown)) {
      editorRef.current?.setHTML(draft.bodyMarkdown);
    } else {
      editorRef.current?.setMarkdown(draft.bodyMarkdown);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id]);

  function openNew() {
    setError(null);
    setDraft({ ...NEW_DRAFT });
  }

  function triggerImport() {
    setError(null);
    importInputRef.current?.click();
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same filename later
    if (!file) return;
    setError(null);
    setImportingFilename(file.name);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const r = await convertDocumentToTemplate(fd);
      setImportingFilename(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Open the editor pre-filled with the conversion result. Bruce
      // reviews, edits, saves through the normal Create flow. Claude's
      // convertor returns markdown — the editor will accept it on first
      // load and then start emitting HTML from that point on.
      setDraft({
        id: null,
        name: r.data.name,
        category: r.data.category,
        bodyMarkdown: r.data.body_markdown,
        defaultSubject: r.data.default_subject ?? "",
      });
      // Force the editor to re-mount with the new content (key on
      // draft.id || 'new', but here we explicitly push the content in
      // via the imperative handle once the editor remounts).
      setTimeout(() => {
        if (looksLikeHtml(r.data.body_markdown)) {
          editorRef.current?.setHTML(r.data.body_markdown);
        } else {
          editorRef.current?.setMarkdown(r.data.body_markdown);
        }
      }, 0);
    });
  }
  function openExisting(t: DocumentTemplate) {
    setError(null);
    setDraft({
      id: t.id,
      name: t.name,
      category: t.category,
      bodyMarkdown: t.bodyMarkdown,
      defaultSubject: t.defaultSubject ?? "",
    });
  }

  function insertVariable(name: string) {
    if (!draft) return;
    editorRef.current?.insertText(`{{${name}}}`);
  }

  function save() {
    if (!draft) return;
    setError(null);
    // Save HTML — the editor is in HTML mode now so alignment + spacing
    // survive the round trip. PDF renderer auto-detects HTML on render.
    const liveBody = editorRef.current?.getHTML() ?? draft.bodyMarkdown;
    startTransition(async () => {
      const payload = {
        name: draft.name.trim(),
        category: draft.category as (typeof DOCUMENT_TEMPLATE_CATEGORIES)[number],
        bodyMarkdown: liveBody,
        defaultSubject: draft.defaultSubject.trim() || null,
      };
      const r = draft.id
        ? await updateDocumentTemplate(draft.id, payload)
        : await createDocumentTemplate(payload);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (
      !confirm(
        "Delete this document template? Existing signed envelopes are unaffected.",
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteDocumentTemplate(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (draft?.id === id) setDraft(null);
      router.refresh();
    });
  }

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <aside className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Your documents
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={importInputRef}
              type="file"
              accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onImportFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={triggerImport}
              disabled={isPending}
              title="Import a .docx or .pdf and let Claude turn it into a template"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line bg-white text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue disabled:opacity-50"
            >
              {importingFilename ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <FileUp className="w-3.5 h-3.5" aria-hidden />
              )}
              {importingFilename ? "Converting…" : "Import doc"}
            </button>
            <button
              type="button"
              onClick={openNew}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> New document
            </button>
          </div>
        </div>
        {importingFilename && (
          <div className="border border-tbb-blue/30 bg-tbb-blue/5 rounded-md px-3 py-2 text-xs text-tbb-ink-2 flex items-start gap-2">
            <Sparkles
              className="w-3.5 h-3.5 text-tbb-blue mt-0.5 shrink-0"
              aria-hidden
            />
            <span>
              Reading <strong>{importingFilename}</strong> and asking Claude
              to convert it. Usually 15–30 seconds for a typical contract.
              When it lands, the editor on the right will be pre-filled.
              Review, edit anything off, and hit Save.
            </span>
          </div>
        )}

        {initialTemplates.length === 0 && !draft ? (
          <div className="border border-tbb-line rounded-lg bg-white p-6 text-center space-y-2">
            <FileSignature
              className="w-7 h-7 text-tbb-blue mx-auto"
              aria-hidden
            />
            <p className="font-bold text-tbb-navy">No document templates yet.</p>
            <p className="text-sm text-tbb-ink-3">
              Start with your standard Business Building Agreement. After
              that, NDAs, proposals, and renewals fall into place quickly.
            </p>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> Build the first one
            </button>
          </div>
        ) : (
          <ul className="border border-tbb-line rounded-lg bg-white divide-y divide-tbb-line-soft overflow-hidden">
            {initialTemplates.map((t) => {
              const isActive = draft?.id === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openExisting(t)}
                    className={
                      "w-full text-left px-4 py-3 flex items-start gap-3 transition-colors " +
                      (isActive
                        ? "bg-tbb-blue-100"
                        : "hover:bg-tbb-cream-50")
                    }
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-tbb-navy truncate">
                        {t.name}
                      </span>
                      <span className="block text-xs text-tbb-ink-3 truncate">
                        {t.defaultSubject ?? "—"}
                      </span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-tbb-caps bg-tbb-cream-200 text-tbb-navy px-2 py-0.5 rounded-pill shrink-0">
                      {CATEGORY_LABELS[t.category] ?? t.category}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="lg:col-span-3">
        {draft ? (
          <div className="border border-tbb-line rounded-lg bg-white p-5 space-y-4 shadow-tbb-sm">
            <div className="flex items-center gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                {draft.id ? "Edit document template" : "New document template"}
              </h3>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="ml-auto text-tbb-ink-3 hover:text-tbb-navy"
                aria-label="Close editor"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Name (your reference)
                </span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft({ ...draft, name: e.target.value })
                  }
                  disabled={isPending}
                  placeholder="e.g. Standard BBA — Accelerator"
                  className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Category
                </span>
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                  disabled={isPending}
                  className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                >
                  {DOCUMENT_TEMPLATE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Default subject (used when sending for signature)
              </span>
              <input
                type="text"
                value={draft.defaultSubject}
                onChange={(e) =>
                  setDraft({ ...draft, defaultSubject: e.target.value })
                }
                disabled={isPending}
                placeholder="Business building agreement"
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
            </label>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Document body
                </span>
                <span className="text-[10px] text-tbb-ink-3">
                  Insert variable:
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {DOCUMENT_VARIABLES.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => insertVariable(v.name)}
                    title={`Insert {{${v.name}}} — ${v.description}`}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-tbb-cream-50 text-tbb-blue border border-tbb-line hover:bg-tbb-blue hover:text-white transition-colors"
                  >
                    {`{{${v.name}}}`}
                  </button>
                ))}
              </div>
              <RichTextEditor
                key={draft.id ?? "new"}
                initialHtml={
                  looksLikeHtml(draft.bodyMarkdown)
                    ? draft.bodyMarkdown
                    : undefined
                }
                initialMarkdown={
                  looksLikeHtml(draft.bodyMarkdown)
                    ? undefined
                    : draft.bodyMarkdown
                }
                richMode
                outputFormat="html"
                placeholder="Write the document body. Use the toolbar for headings, alignment, bold, lists. Drop in variable chips above."
                disabled={isPending}
                editorRef={editorRef}
                onChange={(html) =>
                  setDraft((d) => (d ? { ...d, bodyMarkdown: html } : d))
                }
                ariaLabel="Document body"
              />
            </div>

            {error && (
              <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-tbb-cream-50">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={
                  isPending || !draft.name.trim() || !draft.bodyMarkdown.trim()
                }
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
              >
                {isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                )}
                {draft.id ? "Save changes" : "Create document template"}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={isPending}
                className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
              >
                Cancel
              </button>
              {draft.id && (
                <button
                  type="button"
                  onClick={() => remove(draft.id!)}
                  disabled={isPending}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-danger hover:bg-tbb-danger/10 px-2.5 py-1.5 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden /> Delete
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-tbb-line rounded-lg bg-tbb-cream-50 p-10 text-center space-y-2">
            <FileSignature
              className="w-8 h-8 text-tbb-blue mx-auto"
              aria-hidden
            />
            <p className="font-bold text-tbb-navy">
              Pick a document to edit, or create a new one.
            </p>
            <p className="text-sm text-tbb-ink-3">
              Document templates show up on the &quot;Send for signature&quot;
              panel for any prospect or engagement.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
