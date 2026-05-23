"use client";

/**
 * Inline editor for the prospect's Contact card or Notes block.
 * Click "Edit" → fields slide into edit mode → save / cancel.
 *
 * Contact edits run through the shared `validateProspect` checks
 * (contact name must be 2+ words, can't match company name, email
 * must be valid, phone needs 7+ digits if present). Failures show
 * inline before the server is even called.
 */

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Edit2 } from "lucide-react";
import { updateProspect } from "@/lib/actions/prospects";
import { validateProspect } from "@/lib/pipeline/validate-prospect";

type Field = "contact" | "notes";

export function ProspectInlineEdit({
  prospectId,
  field,
  initial,
  companyName,
}: {
  prospectId: string;
  field: Field;
  initial:
    | {
        contactName: string | null;
        contactEmail: string;
        phone: string | null;
        companyWebsite: string | null;
      }
    | { notes: string | null };
  /** Existing company name for the "contact ≠ company" validation
   *  rule. Only used in field="contact" mode. */
  companyName?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
      >
        <Edit2 className="inline w-3 h-3 mr-1" aria-hidden /> Edit
      </button>
    );
  }

  return field === "contact" ? (
    <ContactEdit
      prospectId={prospectId}
      initial={initial as Extract<typeof initial, { contactEmail: string }>}
      companyName={companyName ?? ""}
      onDone={() => setOpen(false)}
    />
  ) : (
    <NotesEdit
      prospectId={prospectId}
      initialNotes={(initial as { notes: string | null }).notes}
      onDone={() => setOpen(false)}
    />
  );
}

function ContactEdit({
  prospectId,
  initial,
  companyName,
  onDone,
}: {
  prospectId: string;
  initial: {
    contactName: string | null;
    contactEmail: string;
    phone: string | null;
    companyWebsite: string | null;
  };
  companyName: string;
  onDone: () => void;
}) {
  const [contactName, setContactName] = useState(initial.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [companyWebsite, setCompanyWebsite] = useState(
    initial.companyWebsite ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Live validation. We always have the existing companyName for the
  // "contact ≠ company" check.
  const validation = useMemo(
    () =>
      validateProspect({
        companyName: companyName,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        phone: phone.trim() || null,
        // Existing company name is already saved; we don't ask the
        // user to re-confirm legal name on an edit.
        legalNameConfirmed: true,
      }),
    [companyName, contactName, contactEmail, phone],
  );

  function save() {
    setError(null);
    if (!validation.ok) {
      setError(
        validation.errors[0]?.message ?? "Please fix the highlighted fields.",
      );
      return;
    }
    startTransition(async () => {
      const r = await updateProspect({
        id: prospectId,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        phone: phone.trim() || null,
        companyWebsite: companyWebsite.trim() || null,
      });
      if (!r.ok) setError(r.error);
      else onDone();
    });
  }

  const contactIssue = validation.errors.find((i) => i.field === "contactName");
  const emailIssue = validation.errors.find((i) => i.field === "contactEmail");
  const phoneIssue = validation.errors.find((i) => i.field === "phone");

  return (
    <div className="w-full space-y-2">
      <input
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        placeholder="Contact name (first + last)"
        disabled={isPending}
        className={inputCls}
      />
      {contactIssue && <InlineIssue message={contactIssue.message} />}
      <input
        type="email"
        value={contactEmail}
        onChange={(e) => setContactEmail(e.target.value)}
        placeholder="Email"
        disabled={isPending}
        className={inputCls}
      />
      {emailIssue && <InlineIssue message={emailIssue.message} />}
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone"
        disabled={isPending}
        className={inputCls}
      />
      {phoneIssue && <InlineIssue message={phoneIssue.message} />}
      <input
        type="url"
        value={companyWebsite}
        onChange={(e) => setCompanyWebsite(e.target.value)}
        placeholder="https://"
        disabled={isPending}
        className={inputCls}
      />
      {error && <p className="text-sm text-tbb-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={isPending}
          className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function NotesEdit({
  prospectId,
  initialNotes,
  onDone,
}: {
  prospectId: string;
  initialNotes: string | null;
  onDone: () => void;
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateProspect({
        id: prospectId,
        notes: notes.trim() || null,
      });
      if (!r.ok) setError(r.error);
      else onDone();
    });
  }

  return (
    <div className="w-full space-y-2">
      <textarea
        rows={8}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Anything to remember about this prospect (markdown supported)…"
        disabled={isPending}
        className={`${inputCls} resize-y`}
      />
      {error && <p className="text-sm text-tbb-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={isPending}
          className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";

function InlineIssue({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 text-[11px] leading-snug text-tbb-danger"
    >
      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
      <span>{message}</span>
    </p>
  );
}
