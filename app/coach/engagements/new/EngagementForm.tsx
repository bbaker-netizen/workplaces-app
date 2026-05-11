"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  createEngagementAction,
  type CreateEngagementState,
} from "./actions";

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

export function EngagementForm() {
  const [state, action] = useFormState(createEngagementAction, initial);

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
          defaultValue=""
          className={inputClass}
        >
          <option value="" disabled>
            Choose…
          </option>
          <option value="accelerator">Accelerator</option>
          <option value="implementer">Implementer</option>
        </select>
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
