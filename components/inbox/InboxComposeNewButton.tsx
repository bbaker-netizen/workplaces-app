"use client";

/**
 * "Compose new" button + modal for the unified inbox.
 *
 * Before: clicking Compose new bounced you to /business-builder/pipeline
 * to pick a prospect first — three clicks before you could type a
 * subject. Now: opens an inline modal with a searchable recipient
 * picker (prospects + active clients), a subject line, and a rich
 * text body. Sends through the same sendClientMessage server action
 * the per-record composer uses, so the message lands in Gmail AND
 * gets logged in client_communications + the right per-record
 * timeline.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Loader2,
  PenSquare,
  Search,
  Send,
  X,
} from "lucide-react";
import { sendClientMessage } from "@/lib/actions/send-client-message";
import type { ComposeContact } from "@/lib/db/queries/contact-search";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/communication/RichTextEditor";

export function InboxComposeNewButton({
  contacts,
}: {
  contacts: ComposeContact[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
        title="Compose a new email to any prospect or client"
      >
        <PenSquare className="w-3.5 h-3.5" aria-hidden /> Compose new
      </button>
      {open && (
        <ComposeModal contacts={contacts} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ComposeModal({
  contacts,
  onClose,
}: {
  contacts: ComposeContact[];
  onClose: () => void;
}) {
  const router = useRouter();
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const bodyWrapRef = useRef<HTMLDivElement | null>(null);
  const [picked, setPicked] = useState<ComposeContact | null>(null);
  // Open the recipient picker on first mount so the user can start
  // typing immediately — no extra click before they're searching.
  const [pickerOpen, setPickerOpen] = useState(true);
  const [pickerSearch, setPickerSearch] = useState("");
  const [toOverride, setToOverride] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filteredContacts = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return contacts.slice(0, 50);
    return contacts
      .filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.context.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [contacts, pickerSearch]);

  function choose(c: ComposeContact) {
    setPicked(c);
    setPickerOpen(false);
    setPickerSearch("");
    setToOverride(null);
    // Focus the message body so the user can keep typing without
    // tabbing through subject first. Defer to next frame so the
    // editor DOM is mounted before we look for it.
    window.requestAnimationFrame(() => {
      const editable = bodyWrapRef.current?.querySelector<HTMLElement>(
        "[contenteditable='true'], textarea",
      );
      editable?.focus({ preventScroll: true });
    });
  }

  function submit() {
    setError(null);
    if (!picked) {
      setError("Pick a recipient first.");
      return;
    }
    const toAddress = (toOverride ?? picked.email).trim();
    if (!toAddress) {
      setError("Recipient email is empty.");
      return;
    }
    const finalBody = editorRef.current?.getMarkdown() ?? body;
    if (!finalBody.trim()) {
      setError("Message body is empty.");
      return;
    }
    startTransition(async () => {
      const r = await sendClientMessage({
        prospectId: picked.prospectId,
        engagementId: picked.engagementId,
        channel: "email",
        to: [toAddress],
        subject: subject.trim() || null,
        body: finalBody,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Compose new email"
    >
      <div
        className="bg-white rounded-lg shadow-tbb-lg w-full max-w-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-tbb-line flex items-center gap-2">
          <PenSquare className="w-4 h-4 text-tbb-blue" aria-hidden />
          <h2 className="font-bold text-tbb-navy">New email</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-tbb-ink-3 hover:text-tbb-navy"
            aria-label="Close composer"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>

        <div className="px-5 py-4 space-y-3">
          {/* Recipient picker */}
          <div className="relative">
            <label className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 block mb-1">
              To
            </label>
            {picked ? (
              <div className="flex items-center gap-2 flex-wrap bg-tbb-cream-50 border border-tbb-line rounded-md px-3 py-2">
                <span className="font-bold text-tbb-navy text-sm">
                  {picked.displayName}
                </span>
                <span className="text-xs text-tbb-ink-3">
                  ·{" "}
                  <input
                    type="email"
                    value={toOverride ?? picked.email}
                    onChange={(e) => setToOverride(e.target.value)}
                    className="bg-transparent text-xs text-tbb-ink-3 focus:outline-none focus:text-tbb-navy focus:underline w-48 sm:w-64"
                    aria-label="Email address (editable)"
                  />
                </span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 bg-white px-1.5 py-0.5 rounded-pill">
                  {picked.context}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(null);
                    setPickerOpen(true);
                  }}
                  className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 bg-white border border-tbb-line rounded-md px-3 py-2 text-sm text-tbb-ink-2 hover:border-tbb-blue"
                >
                  <span className="flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-tbb-ink-3" aria-hidden />
                    Pick a prospect or client…
                  </span>
                  <ChevronDown className="w-4 h-4 text-tbb-ink-3" aria-hidden />
                </button>
                {pickerOpen && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-tbb-line rounded-md shadow-tbb-md max-h-80 overflow-y-auto">
                    <div className="px-3 py-2 border-b border-tbb-line-soft sticky top-0 bg-white">
                      <input
                        type="text"
                        autoFocus
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        placeholder="Search name, email, or company…"
                        className="w-full text-sm focus:outline-none"
                      />
                    </div>
                    {filteredContacts.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-tbb-ink-3 italic">
                        No matches. Try a different search.
                      </p>
                    ) : (
                      <ul>
                        {filteredContacts.map((c) => (
                          <li key={c.key}>
                            <button
                              type="button"
                              onClick={() => choose(c)}
                              className="w-full text-left px-3 py-2 hover:bg-tbb-cream-50 border-b border-tbb-line-soft last:border-b-0"
                            >
                              <p className="font-bold text-sm text-tbb-navy">
                                {c.displayName}
                              </p>
                              <p className="text-xs text-tbb-ink-3">
                                {c.email}
                              </p>
                              <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 mt-0.5">
                                {c.context}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Subject */}
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Subject
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              disabled={isPending}
            />
          </label>

          {/* Body */}
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Message
            </span>
            <div ref={bodyWrapRef} className="mt-1 border border-tbb-line rounded-md">
              <RichTextEditor
                editorRef={editorRef}
                initialMarkdown={body}
                onChange={setBody}
                placeholder="Write your message…"
              />
            </div>
          </label>

          {error && (
            <p className="text-sm text-tbb-danger bg-tbb-danger/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-tbb-line flex items-center justify-end gap-2 bg-tbb-cream-50/50">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-line bg-white text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue"
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !picked}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="w-3.5 h-3.5" aria-hidden />
            )}
            Send
          </button>
        </footer>
      </div>
    </div>
  );
}
