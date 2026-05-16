"use client";

/**
 * Email signature editor — markdown-aware rich editor so Bruce can drop
 * in bold, links, and lists (icons via emoji glyphs). The signature is
 * appended to every outbound email, rendered as both plain text and
 * HTML at send time.
 */

import { useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setEmailSignature } from "@/lib/actions/user-prefs";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/communication/RichTextEditor";

const STARTER = `**Bruce Baker**
Business Builder · Workplaces

📞 +1 780-555-1234
✉️ [bruce@4workplaces.com](mailto:bruce@4workplaces.com)
🌐 [4workplaces.com](https://4workplaces.com)

> CONFIDENTIALITY NOTICE: This email and any attachments are confidential. If you received this in error, please reply to let me know and delete.`;

export function EmailSignatureEditor({ initial }: { initial: string }) {
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const md = editorRef.current?.getMarkdown() ?? value;
    startTransition(async () => {
      const r = await setEmailSignature(md);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  function loadStarter() {
    editorRef.current?.setMarkdown(STARTER);
    setValue(STARTER);
  }

  return (
    <div className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Signature
        </span>
        <p className="text-[11px] text-tbb-ink-3">
          Use bold, lists, and links. Drop in emoji glyphs for icons
          (📞 ✉️ 🌐 📍). Appears on every email you send through the app.
        </p>
      </div>
      <RichTextEditor
        initialMarkdown={initial}
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
