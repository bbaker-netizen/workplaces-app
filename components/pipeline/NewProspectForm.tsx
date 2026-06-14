"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { createProspect } from "@/lib/actions/prospects";
import { formatPhone } from "@/lib/format";
import { LEAD_SOURCES, STAGE_ORDER, STAGE_STYLES } from "@/lib/pipeline/stages";
import {
  validateProspect,
  type ValidationIssue,
} from "@/lib/pipeline/validate-prospect";

type PricingTierOption = {
  id: string;
  program: string;
  tierKey: string;
  label: string;
  monthlyFeeCents: number;
  sortOrder: number;
};

function formatCentsForInput(cents: number | null): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export function NewProspectForm({
  pricingTiers = [],
}: {
  pricingTiers?: PricingTierOption[];
} = {}) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [referrerName, setReferrerName] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [nextActionNote, setNextActionNote] = useState("");
  const [status, setStatus] = useState<string>("new_lead");
  const [notes, setNotes] = useState("");
  const [legalNameConfirmed, setLegalNameConfirmed] = useState(false);
  // New: program + pricing fields. Optional at lead-capture time;
  // become important before the BBA goes out so the contract has
  // everything it needs.
  const [programType, setProgramType] = useState<string>("");
  const [pricingTierKey, setPricingTierKey] = useState<string>("");
  const [monthlyFeeInput, setMonthlyFeeInput] = useState<string>("");
  const [expectedStartDate, setExpectedStartDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  const tiersForProgram = useMemo(
    () => pricingTiers.filter((t) => t.program === programType),
    [pricingTiers, programType],
  );

  function pickProgram(next: string) {
    setProgramType(next);
    setPricingTierKey("");
    setMonthlyFeeInput("");
  }

  function pickTier(next: string) {
    setPricingTierKey(next);
    const found = tiersForProgram.find((t) => t.tierKey === next);
    if (found) {
      setMonthlyFeeInput(formatCentsForInput(found.monthlyFeeCents));
    }
  }

  // Live validation — runs on every render. Shows soft warnings the
  // user can confirm + per-field errors that block submit. Only
  // surface errors on fields the user has touched OR after a submit
  // attempt, so the form doesn't shout at them while they're typing.
  const validation = useMemo(
    () =>
      validateProspect({
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        phone: phone.trim() || null,
        legalNameConfirmed,
        leadSource: leadSource || null,
        referrerName: referrerName.trim() || null,
      }),
    [
      companyName,
      contactName,
      contactEmail,
      phone,
      legalNameConfirmed,
      leadSource,
      referrerName,
    ],
  );

  // Warn before leaving with unsaved input (tab close / reload / external
  // nav). Only arms once the user has actually typed something.
  const isDirty =
    companyName !== "" ||
    contactName !== "" ||
    contactEmail !== "" ||
    phone !== "" ||
    companyWebsite !== "" ||
    leadSource !== "" ||
    referrerName !== "" ||
    nextActionNote !== "" ||
    notes !== "";
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function issueFor(
    field: ValidationIssue["field"],
    showAll = false,
  ): ValidationIssue | null {
    if (!showAll && !touched[field]) return null;
    return (
      validation.errors.find((i) => i.field === field) ??
      validation.warnings.find((i) => i.field === field) ??
      null
    );
  }

  function submit() {
    setError(null);
    // Force all fields to show their errors on submit attempt.
    setTouched({
      companyName: true,
      contactName: true,
      contactEmail: true,
      phone: true,
      referrerName: true,
    });
    if (!validation.ok) {
      setError(
        validation.errors[0]?.message ?? "Please fix the highlighted fields.",
      );
      return;
    }
    startTransition(async () => {
      // Parse the monthly-fee input (dollars) into cents.
      const feeTrimmed = monthlyFeeInput.trim();
      const monthlyFeeCents =
        feeTrimmed && /^\d+(\.\d{1,2})?$/.test(feeTrimmed)
          ? Math.round(parseFloat(feeTrimmed) * 100)
          : null;
      const r = await createProspect({
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        phone: phone.trim() || null,
        companyWebsite: companyWebsite.trim() || null,
        leadSource: leadSource || null,
        referrerName: leadSource === "Referral" ? referrerName.trim() : null,
        nextActionDate: nextActionDate || null,
        nextActionNote: nextActionNote.trim() || null,
        // @ts-expect-error status is a narrow string enum at runtime
        status,
        notes: notes.trim() || null,
        legalNameConfirmed,
        programType:
          programType === "accelerator" || programType === "implementer"
            ? programType
            : null,
        pricingTier: pricingTierKey || null,
        monthlyFeeCents,
        expectedStartDate: expectedStartDate || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/business-builder/pipeline/${r.data.id}`);
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
        <Field label="Company (legal name)" required issue={issueFor("companyName")}>
          <input
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, companyName: true }))}
            disabled={isPending}
            placeholder="Acme Construction Ltd."
            className={inputCls}
          />
          {issueFor("companyName")?.level === "warning" && (
            <label className="mt-1 flex items-start gap-2 text-[11px] text-tbb-ink-2 cursor-pointer">
              <input
                type="checkbox"
                checked={legalNameConfirmed}
                onChange={(e) => setLegalNameConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Yes, &quot;{companyName.trim()}&quot; really is the registered
                business name.
              </span>
            </label>
          )}
        </Field>
        <Field label="Contact name" required issue={issueFor("contactName")}>
          <input
            required
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, contactName: true }))}
            disabled={isPending}
            placeholder="Jane Smith"
            className={inputCls}
          />
        </Field>
        <Field label="Email" required issue={issueFor("contactEmail")}>
          <input
            required
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, contactEmail: true }))}
            disabled={isPending}
            placeholder="jane@acmeconstruction.com"
            className={inputCls}
          />
        </Field>
        <Field label="Phone" issue={issueFor("phone")}>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => {
              setTouched((t) => ({ ...t, phone: true }));
              if (phone.trim()) setPhone(formatPhone(phone));
            }}
            disabled={isPending}
            placeholder="+1 780-555-1234"
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
        {leadSource === "Referral" && (
          <Field
            label="Referred by"
            required
            issue={issueFor("referrerName")}
          >
            <input
              value={referrerName}
              onChange={(e) => setReferrerName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, referrerName: true }))}
              disabled={isPending}
              placeholder="Who referred them?"
              className={inputCls}
            />
          </Field>
        )}
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

      {/* Program + pricing — captured on the prospect so the BBA can
          be sent without needing a separate engagement-creation step.
          Optional at first; gets filled in as the deal qualifies. */}
      <div className="border border-tbb-line rounded-md bg-tbb-cream-50 p-4 space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-tbb-navy">
            Program &amp; pricing
          </h3>
          <p className="text-[11px] text-tbb-ink-3">
            Fill these in once you know what they&apos;re signing up for. The
            BBA auto-fills from these fields so you don&apos;t have to type
            the numbers into the contract.{" "}
            <a
              href="/business-builder/settings/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-tbb-blue underline underline-offset-2"
            >
              Edit suggested tiers
            </a>
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Program">
            <select
              value={programType}
              onChange={(e) => pickProgram(e.target.value)}
              disabled={isPending}
              className={inputCls}
            >
              <option value="">— Not decided yet —</option>
              <option value="accelerator">Accelerator</option>
              <option value="implementer">Implementer</option>
            </select>
          </Field>
          <Field label="Expected start date">
            <input
              type="date"
              value={expectedStartDate}
              onChange={(e) => setExpectedStartDate(e.target.value)}
              disabled={isPending}
              className={inputCls}
            />
          </Field>
        </div>
        {programType && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Pricing tier — click to suggest a fee
            </span>
            {tiersForProgram.length === 0 ? (
              <p className="text-[11px] text-tbb-ink-3 italic">
                No tiers configured for {programType}. Type the fee in directly
                below.
              </p>
            ) : (
              <div className="grid sm:grid-cols-3 gap-2">
                {tiersForProgram.map((t) => {
                  const active = pricingTierKey === t.tierKey;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickTier(t.tierKey)}
                      className={
                        "text-left px-3 py-2 rounded-md border transition-colors " +
                        (active
                          ? "border-tbb-blue bg-white text-tbb-navy"
                          : "border-tbb-line bg-white hover:bg-tbb-cream-100")
                      }
                      aria-pressed={active}
                    >
                      <span className="block font-bold text-sm">{t.label}</span>
                      <span className="block text-xs text-tbb-ink-3 mt-0.5">
                        ${(t.monthlyFeeCents / 100).toLocaleString()}/month
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <Field label="Monthly fee (CAD)">
          <div className="relative">
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
              value={monthlyFeeInput}
              onChange={(e) => setMonthlyFeeInput(e.target.value)}
              disabled={isPending}
              placeholder="2500"
              className={inputCls + " pl-7"}
            />
          </div>
          <p className="mt-1 text-[11px] text-tbb-ink-3">
            What this client pays per month. Fills the{" "}
            <code className="font-mono">{`{{monthly_fee}}`}</code> placeholder
            in the BBA as &quot;$X/month&quot;.
          </p>
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
  issue,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  issue?: ValidationIssue | null;
}) {
  return (
    <label className={"block space-y-1 " + (className ?? "")}>
      <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        {label}
        {required && <span className="text-tbb-danger ml-0.5">*</span>}
      </span>
      {children}
      {issue && (
        <p
          role={issue.level === "error" ? "alert" : "status"}
          className={
            "flex items-start gap-1.5 text-[11px] leading-snug mt-1 " +
            (issue.level === "error"
              ? "text-tbb-danger"
              : "text-tbb-orange-700")
          }
        >
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
          <span>{issue.message}</span>
        </p>
      )}
    </label>
  );
}
