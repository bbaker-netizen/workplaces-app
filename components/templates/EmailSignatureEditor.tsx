"use client";

/**
 * Email signature editor — rich editor with alignment + underline so
 * Bruce can drop in bold, lists, links, and lay things out the way he
 * wants. Stored as HTML in `user_profiles.email_signature` so spacing,
 * alignment, and underline round-trip exactly.
 *
 * Backward compat: legacy markdown signatures (those that don't start
 * with a `<` tag) are accepted by Tiptap's Markdown extension as
 * input — they just become HTML on the next save. Email send path is
 * already HTML-aware (see `lib/templates/markdown-to-html.ts`).
 */

import { useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setEmailSignature } from "@/lib/actions/user-prefs";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/communication/RichTextEditor";

const STARTER_HTML = `<p><strong>Bruce Baker</strong></p>
<p>Business Builder · Workplaces</p>
<p></p>
<p>📞 +1 780-555-1234</p>
<p>✉️ <a href="mailto:bruce@4workplaces.com">bruce@4workplaces.com</a></p>
<p>🌐 <a href="https://4workplaces.com">4workplaces.com</a></p>
<p></p>
<blockquote><p>CONFIDENTIALITY NOTICE: This email and any attachments are confidential. If you received this in error, please reply to let me know and delete.</p></blockquote>`;

function looksLikeHtml(s: string): boolean {
  const trimmed = s.trim();
  return trimmed.startsWith("<");
}

export function EmailSignatureEditor({ initial }: { initial: string }) {
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Backward compat: legacy signatures may be markdown. Detect and
  // feed the editor whichever format the value actually is — Tiptap's
  // Markdown extension parses both on initial load.
  const initialIsHtml = looksLikeHtml(initial);

  function save() {
    setError(null);
    setSaved(false);
    // Pull the live HTML from the editor. If the editor isn't ready
    // yet (no ref attached), fall back to the change-tracked `value`
    // — never to the original `initial`, which could wipe out unsaved
    // edits if the user clicked Save before the editor hydrated.
    const ref = editorRef.current;
    const html = ref ? ref.getHTML() : value;
    if (!html || html.trim().length === 0) {
      // Allow clearing — but require an extra click. This protects
      // against an accidental "save empty" if the editor hadn't yet
      // hydrated when the user clicked.
      if (!confirm("Save an empty signature? Future emails will have no signature appended.")) {
        return;
      }
    }
    startTransition(async () => {
      const r = await setEmailSignature(html);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  function loadStarter() {
    editorRef.current?.setHTML(STARTER_HTML);
    setValue(STARTER_HTML);
  }

  return (
    <div className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Signature
        </span>
        <p className="text-[11px] text-tbb-ink-3">
          Use bold, underline, alignment, lists, and links. Drop in
          emoji glyphs for icons (📞 ✉️ 🌐 📍). Spacing, alignment, and
          underline now stick — appears on every email you send through
          the app.
        </p>
      </div>
      <RichTextEditor
        initialHtml={initialIsHtml ? initial : undefined}
        initialMarkdown={!initialIsHtml ? initial : undefined}
        richMode
        outputFormat="html"
        placeholder="Your name, title, contact info, disclaimer…"
        disabled={isPending}
        editorRef={editorRef}
        onChange={setValue}
        ariaLabel="Email signature"
      />
      {error && (
        <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-tbb-cream-50">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
        >
          {isPending && (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          )}
          Save signature
        </button>
        {saved && (
          <span className="text-[11px] text-tbb-success font-bold">
            ✓ Saved. New emails will include this.
          </span>
        )}
        {(!value || value.trim().length === 0) && (
          <button
            type="button"
            onClick={loadStarter}
            className="text-[11px] text-tbb-blue hover:underline"
          >
            Use a starter template
          </button>
        )}
      </div>
    </div>
  );
}
