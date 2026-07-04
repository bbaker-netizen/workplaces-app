"use client";

/**
 * Always-visible "lead essentials" card — set Owner, Program, and Lead
 * source right from a fresh lead, without opening the fuller Deal card.
 *
 * Enter everything, then hit Save (one write, no per-field auto-save that
 * gets in the way while you're still typing). Shows a clear Saved / error
 * state so you know it actually persisted.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, UserCircle2 } from "lucide-react";
import { updateProspect } from "@/lib/actions/prospects";
import { LEAD_SOURCES } from "@/lib/pipeline/stages";
import type { BusinessBuilderOption } from "@/lib/db/queries/user-profiles";

export function ProspectLeadEssentials({
  prospectId,
  ownerUserProfileId,
  programType,
  leadSource,
  referrerName,
  businessBuilders,
}: {
  prospectId: string;
  ownerUserProfileId: string | null;
  programType: string | null;
  leadSource: string | null;
  referrerName: string | null;
  businessBuilders: BusinessBuilderOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [owner, setOwner] = useState(ownerUserProfileId ?? "");
  const [program, setProgram] = useState(programType ?? "");
  const [source, setSource] = useState(leadSource ?? "");
  const [referrer, setReferrer] = useState(referrerName ?? "");

  const referralChosen = source === "Referral";

  const dirty =
    owner !== (ownerUserProfileId ?? "") ||
    program !== (programType ?? "") ||
    source !== (leadSource ?? "") ||
    referrer !== (referrerName ?? "");

  function markEdited() {
    // Any change clears the "Saved" tick so it never lies about state.
    if (saved) setSaved(false);
    if (error) setError(null);
  }

  function save() {
    setError(null);
    setSaved(false);
    if (referralChosen && referrer.trim().length < 2) {
      setError("Add the referrer's name — Referral leads need a referrer.");
      return;
    }
    // Only send what changed — never overwrite a field the user didn't
    // touch (a stale form value could otherwise clobber good data).
    const patch: Parameters<typeof updateProspect>[0] = { id: prospectId };
    if (owner !== (ownerUserProfileId ?? "")) {
      patch.ownerUserProfileId = owner || null;
    }
    const normProgram =
      program === "accelerator" || program === "implementer" ? program : null;
    if (normProgram !== (programType ?? null)) {
      patch.programType = normProgram;
    }
    const sourceChanged = source !== (leadSource ?? "");
    const referrerChanged = referrer.trim() !== (referrerName ?? "");
    if (sourceChanged || (referralChosen && referrerChanged)) {
      patch.leadSource = source || null;
      patch.referrerName = referralChosen ? referrer.trim() : null;
    }

    startTransition(async () => {
      const r = await updateProspect(patch);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
      <div className="flex items-center gap-2">
        <UserCircle2 className="w-4 h-4 text-tbb-blue" aria-hidden />
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Lead essentials
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Labeled label="Owner">
          <select
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              markEdited();
            }}
            disabled={pending}
            className={selectCls}
          >
            <option value="">Unassigned</option>
            {businessBuilders.map((b) => (
              <option key={b.id} value={b.id}>
                {b.fullName}
              </option>
            ))}
          </select>
        </Labeled>

        <Labeled label="Program (potential)">
          <select
            value={program}
            onChange={(e) => {
              setProgram(e.target.value);
              markEdited();
            }}
            disabled={pending}
            className={selectCls}
          >
            <option value="">Not set</option>
            <option value="accelerator">Accelerator</option>
            <option value="implementer">Implementer</option>
          </select>
        </Labeled>

        <Labeled label="Lead source">
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              markEdited();
            }}
            disabled={pending}
            className={selectCls}
          >
            <option value="">Not set</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {/* Preserve any non-standard existing value so it still shows. */}
            {source && !LEAD_SOURCES.includes(source as never) && (
              <option value={source}>{source}</option>
            )}
          </select>
        </Labeled>
      </div>

      {referralChosen && (
        <Labeled label="Referred by (required)">
          <input
            value={referrer}
            onChange={(e) => {
              setReferrer(e.target.value);
              markEdited();
            }}
            placeholder="Who referred them?"
            disabled={pending}
            className={selectCls}
          />
        </Labeled>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : null}
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && !dirty && (
          <span className="inline-flex items-center gap-1 text-sm text-tbb-success">
            <Check className="w-4 h-4" aria-hidden /> Saved.
          </span>
        )}
        {error && <span className="text-sm text-tbb-danger">{error}</span>}
      </div>
    </section>
  );
}

const selectCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}
