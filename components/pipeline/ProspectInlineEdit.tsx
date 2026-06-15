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
import { useRouter } from "next/navigation";
import { linkedInSearchUrl } from "@/lib/pipeline/social";
import { AlertTriangle, Edit2 } from "lucide-react";
import { updateProspect } from "@/lib/actions/prospects";
import { validateProspect } from "@/lib/pipeline/validate-prospect";
import { formatPhone } from "@/lib/format";
import {
  hidePendingFeedback,
  showPendingFeedback,
} from "@/components/layout/NavLoaderOverlay";

/** Confirm before tossing unsaved edits. */
function confirmDiscard(dirty: boolean): boolean {
  return !dirty || window.confirm("Discard your unsaved changes?");
}

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
        linkedinUrl: string | null;
      }
    | { notes: string | null };
  /** Current company name. In field="contact" mode it's both the
   *  editable Company field and the value the "contact ≠ company"
   *  validation rule compares against. */
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
    linkedinUrl: string | null;
  };
  companyName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [company, setCompany] = useState(companyName);
  const [contactName, setContactName] = useState(initial.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [companyWebsite, setCompanyWebsite] = useState(
    initial.companyWebsite ?? "",
  );
  const [linkedinUrl, setLinkedinUrl] = useState(initial.linkedinUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Live validation. We always have the existing companyName for the
  // "contact ≠ company" check.
  const validation = useMemo(
    () =>
      validateProspect(
        {
          companyName: company.trim(),
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          phone: phone.trim() || null,
          // On an edit we don't nag about the "looks like a person"
          // soft warning — the coach is deliberately setting the name.
          legalNameConfirmed: true,
        },
        // Update mode: structural name rules become warnings, so editing
        // a phone/website isn't blocked by a legacy one-word contact name.
        "update",
      ),
    [company, contactName, contactEmail, phone],
  );

  function save() {
    setError(null);
    if (!validation.ok) {
      setError(
        validation.errors[0]?.message ?? "Please fix the highlighted fields.",
      );
      return;
    }
    showPendingFeedback("Saving…");
    startTransition(async () => {
      const r = await updateProspect({
        id: prospectId,
        companyName: company.trim(),
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        phone: phone.trim() || null,
        companyWebsite: companyWebsite.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
      });
      hidePendingFeedback();
      if (!r.ok) setError(r.error);
      else {
        onDone();
        router.refresh();
      }
    });
  }

  const dirty =
    company !== companyName ||
    contactName !== (initial.contactName ?? "") ||
    contactEmail !== initial.contactEmail ||
    phone !== (initial.phone ?? "") ||
    companyWebsite !== (initial.companyWebsite ?? "") ||
    linkedinUrl !== (initial.linkedinUrl ?? "");

  const companyIssue = validation.errors.find((i) => i.field === "companyName");
  const contactIssue = validation.errors.find((i) => i.field === "contactName");
  const emailIssue = validation.errors.find((i) => i.field === "contactEmail");
  const phoneIssue = validation.errors.find((i) => i.field === "phone");

  return (
    <div className="w-full space-y-2">
      <label className="block space-y-1">
        <span className={labelCls}>Company (legal name)</span>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Acme Construction Ltd."
          disabled={isPending}
          className={inputCls}
        />
      </label>
      {companyIssue && <InlineIssue message={companyIssue.message} />}
      <label className="block space-y-1">
        <span className={labelCls}>Contact name</span>
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Jane Smith"
          disabled={isPending}
          className={inputCls}
        />
      </label>
      {contactIssue && <InlineIssue message={contactIssue.message} />}
      <label className="block space-y-1">
        <span className={labelCls}>Email</span>
        <input
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="jane@acmeconstruction.com"
          disabled={isPending}
          className={inputCls}
        />
      </label>
      {emailIssue && <InlineIssue message={emailIssue.message} />}
      <label className="block space-y-1">
        <span className={labelCls}>Phone</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => phone.trim() && setPhone(formatPhone(phone))}
          placeholder="(780) 555-1234"
          disabled={isPending}
          className={inputCls}
        />
      </label>
      {phoneIssue && <InlineIssue message={phoneIssue.message} />}
      <label className="block space-y-1">
        <span className={labelCls}>Website</span>
        <input
          type="text"
          inputMode="url"
          value={companyWebsite}
          onChange={(e) => setCompanyWebsite(e.target.value)}
          placeholder="acme.com"
          disabled={isPending}
          className={inputCls}
        />
      </label>
      <label className="block space-y-1">
        <span className="flex items-center justify-between gap-2">
          <span className={labelCls}>LinkedIn</span>
          <a
            href={linkedInSearchUrl(contactName, company)}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
          >
            Find on LinkedIn ↗
          </a>
        </span>
        <input
          type="text"
          inputMode="url"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="linkedin.com/in/…"
          disabled={isPending}
          className={inputCls}
        />
      </label>
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
          onClick={() => confirmDiscard(dirty) && onDone()}
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
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dirty = notes !== (initialNotes ?? "");

  function save() {
    setError(null);
    showPendingFeedback("Saving…");
    startTransition(async () => {
      const r = await updateProspect({
        id: prospectId,
        notes: notes.trim() || null,
      });
      hidePendingFeedback();
      if (!r.ok) setError(r.error);
      else {
        onDone();
        router.refresh();
      }
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
          onClick={() => confirmDiscard(dirty) && onDone()}
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

const labelCls =
  "text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3";

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
