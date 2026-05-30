"use client";

/**
 * Stages-of-Growth diagnostic — public prospect conversion tool.
 *
 * A short intake that places the prospect on a Workplaces growth stage
 * (from team size) and shows a tailored "here's your stage / what's
 * breaking / what to build next" result that sets up a call. Submitting
 * also creates/updates a Prospect record via submitDiagnosticIntake.
 *
 * All stage content is Workplaces' own (see lib/diagnostic/stages).
 */

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { submitDiagnosticIntake } from "@/lib/actions/diagnostic";
import {
  STAGES,
  TEAM_SIZE_BANDS,
  REVENUE_BANDS,
  stageForTeamSize,
  type Stage,
} from "@/lib/diagnostic/stages";

const inputCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";

export function StagesAssessment() {
  const [f, setF] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
    phone: "",
    industry: "",
    teamSize: "",
    revenueRange: "",
    frustration: "",
    whatsStuck: "",
    monthlyCost: "",
    twelveMonthGoal: "",
    ifNothingChanges: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Stage | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  function submit() {
    setError(null);
    if (!f.companyName.trim() || !f.contactName.trim() || !f.contactEmail.trim()) {
      setError("Please fill in your name, email, and company.");
      return;
    }
    if (!f.teamSize) {
      setError("Please choose your team size — that's how we place your stage.");
      return;
    }
    if (f.frustration.trim().length < 10) {
      setError("Tell us a little more about your biggest frustration (a sentence or two).");
      return;
    }
    const stage = STAGES[stageForTeamSize(f.teamSize)];
    startTransition(async () => {
      const r = await submitDiagnosticIntake({
        contactName: f.contactName.trim(),
        contactEmail: f.contactEmail.trim(),
        companyName: f.companyName.trim(),
        industry: f.industry.trim() || null,
        teamSize: TEAM_SIZE_BANDS.find((b) => b.value === f.teamSize)?.label ?? f.teamSize,
        revenueRange: f.revenueRange || null,
        phone: f.phone.trim() || null,
        topChallenge: f.frustration.trim(),
        whatsStuck: f.whatsStuck.trim() || null,
        monthlyCost: f.monthlyCost.trim() || null,
        twelveMonthGoal: f.twelveMonthGoal.trim() || null,
        ifNothingChanges: f.ifNothingChanges.trim() || null,
        stageName: `Stage ${stage.num} — ${stage.name}`,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult(stage);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (result) {
    return (
      <section className="space-y-6">
        <div className="border border-tbb-line rounded-lg bg-white p-6 sm:p-8 space-y-5 shadow-tbb-sm">
          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-tbb-caps text-tbb-blue">
              Your result · Stage {result.num} of 7
            </p>
            <h2 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
              {result.name}
            </h2>
            <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
              Typically {result.band}
            </p>
          </div>

          <Readout label="Where you are" body={result.defines} />
          <Readout label="What usually breaks here" body={result.breaks} accent />
          <Readout label="What to build next" body={result.next} />

          {f.frustration.trim() && (
            <div className="border-t border-tbb-line pt-4">
              <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                You told us your biggest frustration is
              </p>
              <p className="font-sans text-sm text-foreground mt-1 italic">
                &ldquo;{f.frustration.trim()}&rdquo;
              </p>
              <p className="font-sans text-sm text-muted-foreground mt-2">
                That&apos;s exactly the kind of thing a Business Building
                engagement is built to fix at this stage.
              </p>
            </div>
          )}
        </div>

        <div className="border border-tbb-blue/30 bg-tbb-blue/5 rounded-lg p-6 text-center space-y-2">
          <CheckCircle2 className="w-7 h-7 text-tbb-blue mx-auto" aria-hidden />
          <p className="font-bold text-foreground text-lg">Thanks, {f.contactName.trim().split(" ")[0] || "there"} — we&apos;ve got it.</p>
          <p className="font-sans text-sm text-muted-foreground max-w-md mx-auto">
            A Business Builder will review your answers and reach out within
            two business days to walk you through what moving to the next
            stage looks like.
          </p>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-8"
    >
      <Section title="About your business" step="1">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Company" required>
            <input required value={f.companyName} onChange={(e) => set("companyName", e.target.value)} disabled={isPending} className={inputCls} placeholder="Acme Construction Ltd." />
          </Field>
          <Field label="Your name" required>
            <input required value={f.contactName} onChange={(e) => set("contactName", e.target.value)} disabled={isPending} className={inputCls} placeholder="Jane Smith" />
          </Field>
          <Field label="Email" required>
            <input required type="email" value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} disabled={isPending} className={inputCls} placeholder="jane@acme.com" />
          </Field>
          <Field label="Phone">
            <input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} disabled={isPending} className={inputCls} placeholder="+1 780-555-1234" />
          </Field>
          <Field label="Industry">
            <input value={f.industry} onChange={(e) => set("industry", e.target.value)} disabled={isPending} className={inputCls} placeholder="Construction, trades, services…" />
          </Field>
          <Field label="Revenue (rough)">
            <select value={f.revenueRange} onChange={(e) => set("revenueRange", e.target.value)} disabled={isPending} className={inputCls}>
              <option value="">Prefer not to say</option>
              {REVENUE_BANDS.map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
          </Field>
        </div>
        <Field label="How many people on the team?" required>
          <select required value={f.teamSize} onChange={(e) => set("teamSize", e.target.value)} disabled={isPending} className={inputCls}>
            <option value="">Choose one…</option>
            {TEAM_SIZE_BANDS.map((b) => (<option key={b.value} value={b.value}>{b.label}</option>))}
          </select>
        </Field>
      </Section>

      <Section title="What's holding you back" step="2">
        <Field label="Your biggest frustration right now" required>
          <textarea required rows={3} value={f.frustration} onChange={(e) => set("frustration", e.target.value)} disabled={isPending} className={`${inputCls} resize-y`} placeholder="What's the thing that keeps you up at night about the business?" />
        </Field>
        <Field label="What's the one thing most stuck?">
          <input value={f.whatsStuck} onChange={(e) => set("whatsStuck", e.target.value)} disabled={isPending} className={inputCls} placeholder="e.g. can't hire fast enough, margins slipping, I'm the bottleneck" />
        </Field>
        <Field label="What's it costing you each month — in dollars, hours, or stress?">
          <input value={f.monthlyCost} onChange={(e) => set("monthlyCost", e.target.value)} disabled={isPending} className={inputCls} placeholder="Your best guess" />
        </Field>
      </Section>

      <Section title="Where you're headed" step="3">
        <Field label="Where do you want the business to be in 12 months?">
          <textarea rows={2} value={f.twelveMonthGoal} onChange={(e) => set("twelveMonthGoal", e.target.value)} disabled={isPending} className={`${inputCls} resize-y`} placeholder="The picture you're aiming for" />
        </Field>
        <Field label="What happens if nothing changes?">
          <input value={f.ifNothingChanges} onChange={(e) => set("ifNothingChanges", e.target.value)} disabled={isPending} className={inputCls} placeholder="Be honest" />
        </Field>
      </Section>

      {error && (
        <p role="alert" className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-white">
          {error}
        </p>
      )}

      <button type="submit" disabled={isPending} className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-6 py-3 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta">
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ArrowRight className="w-4 h-4" aria-hidden />}
        {isPending ? "Working out your stage…" : "See my stage"}
      </button>
    </form>
  );
}

function Section({ title, step, children }: { title: string; step: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-6 h-6 rounded-full bg-tbb-navy text-white font-bold text-xs">{step}</span>
        <h2 className="font-bold text-foreground text-xl tracking-tight">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        {label}{required && <span className="text-tbb-danger ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function Readout({ label, body, accent }: { label: string; body: string; accent?: boolean }) {
  return (
    <div className={"border-l-2 pl-3 " + (accent ? "border-tbb-orange" : "border-tbb-blue")}>
      <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">{label}</p>
      <p className="font-sans text-base text-foreground mt-0.5">{body}</p>
    </div>
  );
}
