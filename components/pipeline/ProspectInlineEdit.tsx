"use client";

/**
 * Inline editor for the prospect's Contact card or Notes block.
 * Click "Edit" → fields slide into edit mode → save / cancel.
 */

import { useState, useTransition } from "react";
import { Edit2 } from "lucide-react";
import { updateProspect } from "@/lib/actions/prospects";

type Field = "contact" | "notes";

export function ProspectInlineEdit({
  prospectId,
  field,
  initial,
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
  onDone,
}: {
  prospectId: string;
  initial: {
    contactName: string | null;
    contactEmail: string;
    phone: string | null;
    companyWebsite: string | null;
  };
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

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateProspect({
        id: prospectId,
        contactName: contactName.trim() || null,
        contactEmail: contactEmail.trim(),
        phone: phone.trim() || null,
        companyWebsite: companyWebsite.trim() || null,
      });
      if (!r.ok) setError(r.error);
      else onDone();
    });
  }

  return (
    <div className="w-full space-y-2">
      <input
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        placeholder="Contact name"
        disabled={isPending}
        className={inputCls}
      />
      <input
        type="email"
        value={contactEmail}
        onChange={(e) => setContactEmail(e.target.value)}
        placeholder="Email"
        disabled={isPending}
        className={inputCls}
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone"
        disabled={isPending}
        className={inputCls}
      />
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
