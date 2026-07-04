"use client";

/**
 * Always-visible "lead essentials" card — set Owner, Program, and Lead
 * source right from a fresh lead, without opening the fuller Deal card.
 * Owner and Program save on change; Source saves on change too, except
 * Referral, which reveals a required referrer field + Save.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserCircle2 } from "lucide-react";
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

  const [owner, setOwner] = useState(ownerUserProfileId ?? "");
  const [program, setProgram] = useState(programType ?? "");
  const [source, setSource] = useState(leadSource ?? "");
  const [referrer, setReferrer] = useState(referrerName ?? "");

  function save(patch: Parameters<typeof updateProspect>[0]) {
    setError(null);
    startTransition(async () => {
      const r = await updateProspect(patch);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function onOwner(v: string) {
    setOwner(v);
    save({ id: prospectId, ownerUserProfileId: v || null });
  }
  function onProgram(v: string) {
    setProgram(v);
    save({
      id: prospectId,
      programType: v === "accelerator" || v === "implementer" ? v : null,
    });
  }
  function onSource(v: string) {
    setSource(v);
    // Referral needs a referrer before it can save — wait for the Save click.
    if (v !== "Referral") {
      save({ id: prospectId, leadSource: v || null, referrerName: null });
    }
  }

  const referralChosen = source === "Referral";

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
      <div className="flex items-center gap-2">
        <UserCircle2 className="w-4 h-4 text-tbb-blue" aria-hidden />
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Lead essentials
        </h2>
        {pending && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-tbb-ink-3" aria-hidden />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Labeled label="Owner">
          <select
            value={owner}
            onChange={(e) => onOwner(e.target.value)}
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
            onChange={(e) => onProgram(e.target.value)}
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
            onChange={(e) => onSource(e.target.value)}
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
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[180px] space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Referred by (required)
            </span>
            <input
              value={referrer}
              onChange={(e) => setReferrer(e.target.value)}
              placeholder="Who referred them?"
              disabled={pending}
              className={selectCls}
            />
          </label>
          <button
            type="button"
            disabled={pending || referrer.trim().length < 2}
            onClick={() =>
              save({
                id: prospectId,
                leadSource: "Referral",
                referrerName: referrer.trim(),
              })
            }
            className="text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
          >
            Save source
          </button>
        </div>
      )}

      {error && <p className="text-sm text-tbb-danger">{error}</p>}
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
