"use client";

/**
 * Templates manager — inline create / edit / delete for email templates.
 * No separate detail pages; click a row → editor panel slides open on
 * the right.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import {
  createEmailTemplate,
  deleteEmailTemplate,
  updateEmailTemplate,
} from "@/lib/actions/email-templates";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_VARIABLES,
} from "@/lib/templates/variables";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/communication/RichTextEditor";
import type { EmailTemplate } from "@/lib/db/schema";

const CATEGORY_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  contract: "Contract",
  proposal: "Proposal",
  follow_up: "Follow-up",
  intro: "Intro",
  other: "Other",
};

type Draft = {
  id: string | null;
  name: string;
  category: string;
  subject: string;
  body: string;
};

const NEW_DRAFT: Draft = {
  id: null,
  name: "",
  category: "other",
  subject: "",
  body: "Hi {{contact_first_name}},\n\n\n\n— {{sender_first_name}}",
};

export function TemplatesManager({
  initialTemplates,
}: {
  initialTemplates: EmailTemplate[];
}) {
  const router = useRouter();
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // When the draft swaps from one template to another (or to a brand-new
  // draft), push the new body into the editor. Without this the editor
  // keeps showing the previously selected template's body.
  useEffect(() => {
    if (!draft) return;
    const current = editorRef.current?.getMarkdown() ?? "";
    if (current !== draft.body) {
      editorRef.current?.setMarkdown(draft.body);
    }
    // We only want this to run when the draft IDENTITY changes, not on
    // every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id]);

  function openNew() {
    setError(null);
    setDraft({ ...NEW_DRAFT });
  }
  function openExisting(t: EmailTemplate) {
    setError(null);
    setDraft({
      id: t.id,
      name: t.name,
      category: t.category,
      subject: t.subject,
      body: t.body,
    });
  }

  function insertVariable(name: string) {
    if (!draft) return;
    const token = `{{${name}}}`;
    // Insert at the cursor in the rich editor, and keep our React mirror
    // in sync via the onChange path that fires immediately after.
    editorRef.current?.insertText(token);
  }

  function save() {
    if (!draft) return;
    setError(null);
    const liveBody = editorRef.current?.getMarkdown() ?? draft.body;
    startTransition(async () => {
      const payload = {
        name: draft.name.trim(),
        category: draft.category as (typeof TEMPLATE_CATEGORIES)[number],
        subject: draft.subject.trim(),
        body: liveBody.trim(),
      };
      const r = draft.id
        ? await updateEmailTemplate(draft.id, payload)
        : await createEmailTemplate(payload);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this template? Sent emails using it stay intact.")) {
      return;
    }
    startTransition(async () => {
      const r = await deleteEmailTemplate(id);
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
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Your templates
          </h2>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> New template
          </button>
        </div>

        {initialTemplates.length === 0 && !draft ? (
          <div className="border border-tbb-line rounded-lg bg-white p-6 text-center space-y-2">
            <p className="text-2xl" aria-hidden>
              📨
            </p>
            <p className="font-bold text-tbb-navy">No templates yet.</p>
            <p className="text-sm text-tbb-ink-3">
              Build your first one — kickoff welcome, contract intro,
              follow-up nudge, anything you send more than twice.
            </p>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> Build one
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
                        {t.subject}
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
              <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                {draft.id ? "Edit template" : "New template"}
              </h2>
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
                  placeholder="e.g. Kickoff welcome"
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
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Subject
              </span>
              <input
                type="text"
                value={draft.subject}
                onChange={(e) =>
                  setDraft({ ...draft, subject: e.target.value })
                }
                disabled={isPending}
                placeholder="Welcome to Workplaces — let's get started"
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
            </label>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Body
                </span>
                <span className="text-[10px] text-tbb-ink-3">
                  Insert variable:
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => insertVariable(v.name)}
                    title={`Insert {{${v.name}}}`}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-tbb-cream-50 text-tbb-blue border border-tbb-line hover:bg-tbb-blue hover:text-white transition-colors"
                  >
                    {`{{${v.name}}}`}
                  </button>
                ))}
              </div>
              <RichTextEditor
                key={draft.id ?? "new"}
                initialMarkdown={draft.body}
                placeholder="Write the email body. Drop in variables from the chips above, use bold/lists/links, add emoji glyphs for icons."
                disabled={isPending}
                editorRef={editorRef}
                onChange={(md) => setDraft((d) => (d ? { ...d, body: md } : d))}
                ariaLabel="Template body"
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
                  isPending ||
                  !draft.name.trim() ||
                  !draft.subject.trim() ||
                  !draft.body.trim()
                }
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
              >
                {isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                )}
                {draft.id ? "Save changes" : "Create template"}
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
            <p className="text-3xl" aria-hidden>
              ✏️
            </p>
            <p className="font-bold text-tbb-navy">
              Pick a template to edit, or create a new one.
            </p>
            <p className="text-sm text-tbb-ink-3">
              Templates show up automatically in the prospect / client email
              composer with their variables resolved.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
