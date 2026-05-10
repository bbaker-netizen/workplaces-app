"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { submitDiagnosticIntake } from "@/lib/actions/diagnostic";

export function DiagnosticForm() {
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [revenueRange, setRevenueRange] = useState("");
  const [timing, setTiming] = useState("");
  const [topChallenge, setTopChallenge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (success) {
    return (
      <div className="border border-[#2E4057] rounded-md bg-[#F5F1E8] p-8 text-center space-y-4">
        <CheckCircle2 className="w-12 h-12 mx-auto text-[#2E4057]" aria-hidden />
        <p className="font-display font-bold text-foreground text-3xl tracking-tight">
          Got it.
        </p>
        <p className="font-sans text-base text-foreground">
          We&apos;ll review and be in touch within two business days at{" "}
          <strong>{contactEmail}</strong>.
        </p>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const r = await submitDiagnosticIntake({
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        companyName: companyName.trim(),
        companyWebsite: companyWebsite.trim() || null,
        industry: industry.trim() || null,
        teamSize: teamSize.trim() || null,
        revenueRange: revenueRange.trim() || null,
        timing: timing.trim() || null,
        topChallenge: topChallenge.trim(),
      });
      if (!r.ok) setError(r.error);
      else setSuccess(true);
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
      aria-busy={isPending}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Your name" required>
          <input
            required
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
        <Field label="Company name" required>
          <input
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={isPending}
            className={inputCls}
          />
        </Field>
        <Field label="Website (optional)">
          <input
            type="url"
            placeholder="https://"
            value={companyWebsite}
            onChange={(e) => setCompanyWebsite(e.target.value)}
            disabled={isPending}
            className={inputCls}
          />
        </Field>
        <Field label="Industry (optional)">
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            disabled={isPending}
            placeholder="Construction, services, retail…"
            className={inputCls}
          />
        </Field>
        <Field label="Team size (optional)">
          <select
            value={teamSize}
            onChange={(e) => setTeamSize(e.target.value)}
            disabled={isPending}
            className={inputCls}
          >
            <option value="">Pick one</option>
            <option value="1-5">1 – 5</option>
            <option value="6-15">6 – 15</option>
            <option value="16-50">16 – 50</option>
            <option value="51-200">51 – 200</option>
            <option value="200+">200+</option>
          </select>
        </Field>
        <Field label="Annual revenue (optional)">
          <select
            value={revenueRange}
            onChange={(e) => setRevenueRange(e.target.value)}
            disabled={isPending}
            className={inputCls}
          >
            <option value="">Pick one</option>
            <option value="<$500K">Under $500K</option>
            <option value="$500K-$2M">$500K – $2M</option>
            <option value="$2M-$10M">$2M – $10M</option>
            <option value="$10M-$50M">$10M – $50M</option>
            <option value="$50M+">$50M+</option>
          </select>
        </Field>
        <Field label="Timing (optional)">
          <select
            value={timing}
            onChange={(e) => setTiming(e.target.value)}
            disabled={isPending}
            className={inputCls}
          >
            <option value="">Pick one</option>
            <option value="Now">Looking to start now</option>
            <option value="3 months">In the next 3 months</option>
            <option value="6 months">In the next 6 months</option>
            <option value="Just exploring">Just exploring</option>
          </select>
        </Field>
      </div>

      <Field
        label="What's the top challenge you'd want help with?"
        required
      >
        <textarea
          required
          rows={5}
          value={topChallenge}
          onChange={(e) => setTopChallenge(e.target.value)}
          disabled={isPending}
          minLength={10}
          maxLength={4000}
          placeholder="A few sentences. Where's the friction? What outcome would matter most?"
          className={`${inputCls} resize-y`}
        />
      </Field>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-6 py-3 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50"
      >
        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {isPending ? "Sending…" : "Send diagnostic"}
      </button>
    </form>
  );
}

const inputCls =
  "w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]";

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
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
        {required && <span className="text-[#E87722] ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
