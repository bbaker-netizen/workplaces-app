"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createProspect } from "@/lib/actions/prospects";
import { LEAD_SOURCES, STAGE_ORDER, STAGE_STYLES } from "@/lib/pipeline/stages";

export function NewProspectForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [expectedValue, setExpectedValue] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [nextActionNote, setNextActionNote] = useState("");
  const [status, setStatus] = useState<string>("new_lead");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const valueNum = Number(expectedValue);
      const valueCents =
        expectedValue.trim() && Number.isFinite(valueNum) && valueNum >= 0
          ? Math.round(valueNum * 100)
          : null;
      const r = await createProspect({
        companyName: companyName.trim(),
        contactName: contactName.trim() || null,
        contactEmail: contactEmail.trim(),
        phone: phone.trim() || null,
        companyWebsite: companyWebsite.trim() || null,
        leadSource: leadSource || null,
        expectedValueCents: valueCents,
        nextActionDate: nextActionDate || null,
        nextActionNote: nextActionNote.trim() || null,
        // @ts-expect-error status is a narrow string enum at runtime
        status,
        notes: notes.trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/coach/pipeline/${r.data.id}`);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Company" required>
          <input
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={isPending}
            className={inputCls}
          />
        </Field>
        <Field label="Contact name">
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            disabled={isPending}
            className={inputCls}
          />
        </Field>
        <Field label="Email" required>
          <input
            required
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            disabled={isPending}
            className={inputCls}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isPending}
            className={inputCls}
          />
        </Field>
        <Field label="Website">
          <input
            type="url"
            placeholder="https://"
            value={companyWebsite}
            onChange={(e) => setCompanyWebsite(e.target.value)}
            disabled={isPending}
            className={inputCls}
          />
        </Field>
        <Field label="Lead source">
          <select
            value={leadSource}
            onChange={(e) => setLeadSource(e.target.value)}
            disabled={isPending}
            className={inputCls}
          >
            <option value="">Pick one</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expected value (CAD)">
          <div className="flex items-center gap-1">
            <span className="text-sm text-tbb-ink-3">$</span>
            <input
              type="number"
              step="100"
              min="0"
              value={expectedValue}
              onChange={(e) => setExpectedValue(e.target.value)}
              disabled={isPending}
              className={inputCls}
            />
          </div>
        </Field>
        <Field label="Initial stage">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={isPending}
            className={inputCls}
          >
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_STYLES[s].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next action date">
          <input
            type="date"
            value={nextActionDate}
            onChange={(e) => setNextActionDate(e.target.value)}
            disabled={isPending}
            className={inputCls}
          />
        </Field>
        <Field label="Next action note">
          <input
            value={nextActionNote}
            onChange={(e) => setNextActionNote(e.target.value)}
            disabled={isPending}
            placeholder="Follow up after intro call"
            className={inputCls}
          />
        </Field>
        <Field label="Notes (optional)" className="sm:col-span-2">
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isPending}
            placeholder="Context, source notes, anything to remember for the first call."
            className={`${inputCls} resize-y`}
          />
        </Field>
      </div>

      {error && (
        <p
          role="alert"
          className="text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        ) : (
          <Plus className="w-4 h-4" aria-hidden />
        )}
        {isPending ? "Adding…" : "Add prospect"}
      </button>
    </form>
  );
}

const inputCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={"block space-y-1 " + (className ?? "")}>
      <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        {label}
        {required && <span className="text-tbb-danger ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
