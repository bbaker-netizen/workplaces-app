"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createEngagementAction,
  type CreateEngagementState,
} from "./actions";

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

const initial: CreateEngagementState = { kind: "idle" };

const inputClass =
  "w-full px-3 py-2 border border-tbb-line rounded-md bg-white text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-secondary focus:border-transparent " +
  "font-sans";

const labelClass =
  "block font-sans text-sm font-bold text-foreground mb-1.5";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        "font-sans bg-foreground text-background px-6 py-3 rounded-md " +
        "hover:bg-secondary transition-colors uppercase tracking-wider text-sm " +
        "disabled:opacity-60 disabled:cursor-not-allowed"
      }
    >
      {pending ? "Creating…" : "Create engagement"}
    </button>
  );
}

export function EngagementForm({
  onboardingTemplates = [],
  pricingTiers = [],
}: {
  onboardingTemplates?: { id: string; name: string; category: string }[];
  pricingTiers?: PricingTierOption[];
} = {}) {
  const [state, action] = useFormState(createEngagementAction, initial);

  // Pricing UI state. Selected program drives which tiers show; the
  // selected tier pre-fills the fee input; the input is editable so
  // Bruce can override per-deal.
  const [program, setProgram] = useState<string>("");
  const [tierKey, setTierKey] = useState<string>("");
  const [feeInput, setFeeInput] = useState<string>("");

  const tiersForProgram = useMemo(
    () => pricingTiers.filter((t) => t.program === program),
    [pricingTiers, program],
  );

  // When the user picks a tier, pre-fill the fee input. Empty tier
  // selection means "custom" — leave the input alone.
  function selectTier(nextTier: string) {
    setTierKey(nextTier);
    const found = tiersForProgram.find((t) => t.tierKey === nextTier);
    if (found) {
      setFeeInput(formatCentsForInput(found.monthlyFeeCents));
    }
  }

  // When the program changes, reset tier + fee.
  function selectProgram(nextProgram: string) {
    setProgram(nextProgram);
    setTierKey("");
    setFeeInput("");
  }

  if (state.kind === "success") {
    return (
      <div className="space-y-6 max-w-xl">
        <h2 className="font-bold text-foreground text-3xl tracking-tight leading-none">
          Engagement created
        </h2>
        <p className="font-sans text-muted-foreground">
          Invitation sent to{" "}
          <span className="font-mono text-foreground">{state.invitedEmail}</span>
          . They&apos;ll receive an email from Clerk with a link to sign up
          and land in their portal.
        </p>
        <dl className="font-mono text-xs space-y-2 text-muted-foreground border-t border-tbb-line pt-6">
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <dt>App engagement</dt>
            <dd className="text-foreground">{state.engagementId}</dd>
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <dt>App org</dt>
            <dd className="text-foreground">{state.appOrgId}</dd>
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <dt>Clerk org</dt>
            <dd className="text-foreground">{state.clerkOrgId}</dd>
          </div>
        </dl>
        <div className="flex gap-4 pt-4">
          <a
            href="/coach/engagements/new"
            className="font-sans bg-foreground text-background px-6 py-3 rounded-pill hover:bg-secondary transition-colors uppercase tracking-wider text-sm"
          >
            Create another
          </a>
          <a
            href="/coach"
            className="font-sans text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline self-center"
          >
            Back to Business Builder Console
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5 max-w-xl">
      <div>
        <label htmlFor="engagementName" className={labelClass}>
          Engagement name
        </label>
        <input
          id="engagementName"
          name="engagementName"
          type="text"
          required
          maxLength={200}
          placeholder="Impactica"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="engagementType" className={labelClass}>
          Type
        </label>
        <select
          id="engagementType"
          name="engagementType"
          required
          value={program}
          onChange={(e) => selectProgram(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Choose…
          </option>
          <option value="accelerator">Accelerator</option>
          <option value="implementer">Implementer</option>
        </select>
      </div>

      {program && (
        <div className="border border-tbb-line rounded-md bg-white p-4 space-y-3">
          <div className="space-y-1">
            <span className={labelClass + " mb-0"}>Pricing tier</span>
            <p className="text-xs text-muted-foreground">
              Pick a tier to pre-fill the monthly fee, or leave blank and
              type a custom amount below.{" "}
              <a
                href="/coach/settings/pricing"
                className="text-tbb-blue underline underline-offset-2"
              >
                Edit tiers
              </a>
            </p>
          </div>
          {tiersForProgram.length === 0 ? (
            <p className="text-xs text-tbb-ink-3 italic">
              No tiers configured for {program}. Type the fee in directly
              below.
            </p>
          ) : (
            <div className="grid sm:grid-cols-3 gap-2">
              {tiersForProgram.map((t) => {
                const active = tierKey === t.tierKey;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTier(t.tierKey)}
                    className={
                      "text-left px-3 py-2.5 rounded-md border transition-colors " +
                      (active
                        ? "border-tbb-blue bg-tbb-blue-100 text-tbb-navy"
                        : "border-tbb-line bg-white hover:bg-tbb-cream-50")
                    }
                    aria-pressed={active}
                  >
                    <span className="block font-bold text-sm">
                      {t.label}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      ${(t.monthlyFeeCents / 100).toLocaleString()}/month
                    </span>
                  </button>
                );
              })}
              {tierKey && (
                <button
                  type="button"
                  onClick={() => {
                    setTierKey("");
                    setFeeInput("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 sm:col-span-3 text-left"
                >
                  Clear selection
                </button>
              )}
            </div>
          )}
          <input type="hidden" name="pricingTier" value={tierKey} />
        </div>
      )}

      <div>
        <label htmlFor="monthlyFee" className={labelClass}>
          Monthly fee <span className="text-tbb-ink-3 font-normal">(USD)</span>
        </label>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-tbb-ink-3 pointer-events-none"
            aria-hidden
          >
            $
          </span>
          <input
            id="monthlyFee"
            name="monthlyFee"
            type="number"
            inputMode="decimal"
            min="0"
            step="50"
            placeholder="0"
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
            className={inputClass + " pl-7"}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          What this client pays per month. Used to auto-fill the{" "}
          <span className="font-mono">{`{{monthly_fee}}`}</span> placeholder
          in contracts. Override the tier suggestion above if needed.
        </p>
      </div>

      <div>
        <label htmlFor="clientLeadFullName" className={labelClass}>
          Client lead — full name
        </label>
        <input
          id="clientLeadFullName"
          name="clientLeadFullName"
          type="text"
          required
          maxLength={200}
          placeholder="First Last"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="clientLeadEmail" className={labelClass}>
          Client lead — email
        </label>
        <input
          id="clientLeadEmail"
          name="clientLeadEmail"
          type="email"
          required
          placeholder="lead@example.com"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="startDate" className={labelClass}>
          Start date
        </label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          required
          className={inputClass}
        />
      </div>

      <div className="border border-tbb-line rounded-md bg-white p-4 space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            id="seedSoulFile"
            name="seedSoulFile"
            type="checkbox"
            defaultChecked
            className="mt-1 w-4 h-4 rounded border-tbb-line text-tbb-orange focus:ring-tbb-orange"
          />
          <span>
            <span className={labelClass + " mb-0.5"}>
              Seed Soul File from Fireflies (recommended)
            </span>
            <span className="block text-xs text-muted-foreground leading-snug">
              Pulls the last 3 Fireflies transcripts where this client&apos;s
              email is an attendee and has Claude draft a starter Soul File
              you can edit. If there&apos;s no history, the Soul File just
              starts empty — no harm done.
            </span>
          </span>
        </label>
      </div>

      <div>
        <label htmlFor="onboardingTemplateId" className={labelClass}>
          Auto-send onboarding email (optional)
        </label>
        {onboardingTemplates.length === 0 ? (
          <div className="rounded-md border border-dashed border-tbb-line bg-tbb-cream-50 px-3 py-3 text-sm space-y-2">
            <p className="text-tbb-ink-2">
              No onboarding templates yet — that&apos;s why the dropdown is
              empty.
            </p>
            <p className="text-xs text-tbb-ink-3">
              Build a template with category{" "}
              <span className="font-mono">onboarding</span> and it&apos;ll
              show up here automatically next time.
            </p>
            <a
              href="/coach/templates"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
            >
              Build onboarding template →
            </a>
            {/* Keep the hidden field so the form always submits the key. */}
            <input type="hidden" name="onboardingTemplateId" value="" />
          </div>
        ) : (
          <>
            <select
              id="onboardingTemplateId"
              name="onboardingTemplateId"
              defaultValue=""
              className={inputClass}
            >
              <option value="">— Don&apos;t auto-send anything —</option>
              {onboardingTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Picks from{" "}
              <a
                href="/coach/templates"
                className="text-tbb-blue underline underline-offset-2"
              >
                templates marked &quot;onboarding&quot;
              </a>
              . Fires right after the Clerk invitation goes out, from your
              Gmail if connected.
            </p>
          </>
        )}
      </div>

      {state.kind === "error" && (
        <p className="font-sans text-tbb-danger text-sm border-l-2 border-tbb-danger pl-3 py-1">
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton />
        <a
          href="/coach"
          className="font-sans text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
