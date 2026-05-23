"use client";

/**
 * Company info edit form. Sectioned: Identity, Address, Contact, Tax.
 * Saves the whole thing in one POST so Bruce isn't clicking save per
 * field.
 */

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { updateOrgSettings } from "@/lib/actions/org-settings";

type FormState = {
  name: string;
  legalName: string;
  businessAddress: string;
  businessCity: string;
  businessProvince: string;
  businessCountry: string;
  businessPostalCode: string;
  businessPhone: string;
  businessWebsite: string;
  taxId: string;
};

export function CompanyInfoForm({ initial }: { initial: FormState }) {
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function field<K extends keyof FormState>(k: K) {
    return (v: string) => setForm((prev) => ({ ...prev, [k]: v }));
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await updateOrgSettings({
        name: form.name.trim(),
        legalName: form.legalName.trim() || null,
        businessAddress: form.businessAddress.trim() || null,
        businessCity: form.businessCity.trim() || null,
        businessProvince: form.businessProvince.trim() || null,
        businessCountry: form.businessCountry.trim() || null,
        businessPostalCode: form.businessPostalCode.trim() || null,
        businessPhone: form.businessPhone.trim() || null,
        businessWebsite: form.businessWebsite.trim() || null,
        taxId: form.taxId.trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-6"
      aria-busy={isPending}
    >
      <Section title="Identity">
        <Field label="Display name" required>
          <input
            required
            value={form.name}
            onChange={(e) => field("name")(e.target.value)}
            disabled={isPending}
            placeholder="Workplaces"
            className={inputCls}
          />
          <Hint>What shows in the sidebar, emails, and dashboards.</Hint>
        </Field>
        <Field label="Legal entity name">
          <input
            value={form.legalName}
            onChange={(e) => field("legalName")(e.target.value)}
            disabled={isPending}
            placeholder="HR All-In Inc."
            className={inputCls}
          />
          <Hint>
            The full registered name, including &quot;Inc.&quot; / &quot;Ltd.&quot;.
            Renders in contracts as <code className="font-mono">{`{{org_legal_name}}`}</code>.
            If blank, falls back to the display name above.
          </Hint>
        </Field>
      </Section>

      <Section title="Business address">
        <Field label="Street address">
          <input
            value={form.businessAddress}
            onChange={(e) => field("businessAddress")(e.target.value)}
            disabled={isPending}
            placeholder="123 Main Street, Suite 200"
            className={inputCls}
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="City">
            <input
              value={form.businessCity}
              onChange={(e) => field("businessCity")(e.target.value)}
              disabled={isPending}
              placeholder="Edmonton"
              className={inputCls}
            />
          </Field>
          <Field label="Province / state">
            <input
              value={form.businessProvince}
              onChange={(e) => field("businessProvince")(e.target.value)}
              disabled={isPending}
              placeholder="Alberta"
              className={inputCls}
            />
          </Field>
          <Field label="Country">
            <input
              value={form.businessCountry}
              onChange={(e) => field("businessCountry")(e.target.value)}
              disabled={isPending}
              placeholder="Canada"
              className={inputCls}
            />
          </Field>
          <Field label="Postal / zip code">
            <input
              value={form.businessPostalCode}
              onChange={(e) => field("businessPostalCode")(e.target.value)}
              disabled={isPending}
              placeholder="T5J 1Z9"
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      <Section title="Contact">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Business phone">
            <input
              type="tel"
              value={form.businessPhone}
              onChange={(e) => field("businessPhone")(e.target.value)}
              disabled={isPending}
              placeholder="+1 780-555-1234"
              className={inputCls}
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              value={form.businessWebsite}
              onChange={(e) => field("businessWebsite")(e.target.value)}
              disabled={isPending}
              placeholder="https://4workplaces.com"
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      <Section title="Tax">
        <Field label="Tax ID (GST / HST / EIN / VAT)">
          <input
            value={form.taxId}
            onChange={(e) => field("taxId")(e.target.value)}
            disabled={isPending}
            placeholder="123456789 RT0001"
            className={inputCls + " font-mono"}
          />
          <Hint>
            Appears on every invoice. Canadian businesses with GST/HST
            registration need this here for the invoice to be valid.
          </Hint>
        </Field>
      </Section>

      {error && (
        <p
          role="alert"
          className="text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 sticky bottom-0 bg-background pt-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <Save className="w-4 h-4" aria-hidden />
          )}
          {isPending ? "Saving…" : "Save company info"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-xs text-tbb-success font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

const inputCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-4 shadow-tbb-sm">
      <h2 className="text-sm font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        {label}
        {required && <span className="text-tbb-danger ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-tbb-ink-3 leading-snug">{children}</p>
  );
}
