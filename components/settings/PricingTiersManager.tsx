"use client";

/**
 * Pricing tiers settings UI — list-then-edit pattern with separate
 * Accelerator + Implementer sections.
 *
 * Bruce uses this to set up his actual price grid. Each row has an
 * edit-in-place form (label + dollar amount + sort order). Add new
 * tiers per program. Delete unused tiers.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import {
  createPricingTier,
  deletePricingTier,
  updatePricingTier,
} from "@/lib/actions/pricing-tiers";

type Tier = {
  id: string;
  program: string;
  tierKey: string;
  label: string;
  monthlyFeeCents: number;
  sortOrder: number;
};

type Draft = {
  id: string | null;
  program: "accelerator" | "implementer";
  tierKey: string;
  label: string;
  monthlyFeeDollars: string;
  sortOrder: number;
};

const PROGRAM_LABELS: Record<string, string> = {
  accelerator: "Accelerator",
  implementer: "Implementer",
};

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

function inputToCents(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(parseFloat(trimmed) * 100);
}

export function PricingTiersManager({
  initialTiers,
}: {
  initialTiers: Tier[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const grouped = {
    accelerator: initialTiers.filter((t) => t.program === "accelerator"),
    implementer: initialTiers.filter((t) => t.program === "implementer"),
  };

  function openNew(program: "accelerator" | "implementer") {
    setError(null);
    setDraft({
      id: null,
      program,
      tierKey: "",
      label: "",
      monthlyFeeDollars: "",
      sortOrder:
        Math.max(0, ...grouped[program].map((t) => t.sortOrder)) + 10,
    });
  }

  function openEdit(t: Tier) {
    setError(null);
    setDraft({
      id: t.id,
      program: t.program as "accelerator" | "implementer",
      tierKey: t.tierKey,
      label: t.label,
      monthlyFeeDollars: centsToInput(t.monthlyFeeCents),
      sortOrder: t.sortOrder,
    });
  }

  function save() {
    if (!draft) return;
    setError(null);
    const cents = inputToCents(draft.monthlyFeeDollars);
    if (cents === null) {
      setError("Monthly fee must be a positive number (e.g. 1500 or 1500.00).");
      return;
    }
    if (!draft.tierKey.trim()) {
      setError("Tier key is required (e.g. 'small' or 'enterprise').");
      return;
    }
    if (!draft.label.trim()) {
      setError("Label is required (what gets shown in the picker).");
      return;
    }
    startTransition(async () => {
      const payload = {
        program: draft.program,
        tierKey: draft.tierKey.trim().toLowerCase(),
        label: draft.label.trim(),
        monthlyFeeCents: cents,
        sortOrder: draft.sortOrder,
      };
      const r = draft.id
        ? await updatePricingTier(draft.id, payload)
        : await createPricingTier(payload);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (
      !confirm(
        "Delete this tier? Existing engagements that used it keep their fee — only the suggested-default goes away.",
      )
    )
      return;
    startTransition(async () => {
      const r = await deletePricingTier(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (draft?.id === id) setDraft(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50">
          {error}
        </p>
      )}

      {(["accelerator", "implementer"] as const).map((program) => (
        <section
          key={program}
          className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm"
        >
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-tbb-navy">
              {PROGRAM_LABELS[program]} tiers
            </h2>
            <button
              type="button"
              onClick={() => openNew(program)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line bg-white text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> Add tier
            </button>
          </div>
          {grouped[program].length === 0 ? (
            <p className="text-sm text-tbb-ink-3 italic">
              No {program} tiers yet. Click <strong>Add tier</strong> to
              create one.
            </p>
          ) : (
            <ul className="divide-y divide-tbb-line-soft">
              {grouped[program].map((t) => {
                const isEditing = draft?.id === t.id;
                if (isEditing && draft) {
                  return (
                    <li key={t.id} className="py-3">
                      <DraftRow
                        draft={draft}
                        setDraft={setDraft}
                        save={save}
                        cancel={() => setDraft(null)}
                        remove={() => remove(t.id)}
                        isPending={isPending}
                      />
                    </li>
                  );
                }
                return (
                  <li
                    key={t.id}
                    className="py-3 flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-tbb-navy">{t.label}</p>
                      <p className="text-xs text-tbb-ink-3 font-mono">
                        {t.tierKey}
                      </p>
                    </div>
                    <p className="font-bold text-tbb-navy text-lg">
                      ${(t.monthlyFeeCents / 100).toLocaleString()}/mo
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        disabled={isPending}
                        className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        disabled={isPending}
                        className="text-tbb-danger hover:text-tbb-danger/80"
                        aria-label="Delete tier"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* "New" draft for this program lives at the bottom of its list. */}
          {draft && draft.id === null && draft.program === program && (
            <div className="border-t border-tbb-line pt-3">
              <DraftRow
                draft={draft}
                setDraft={setDraft}
                save={save}
                cancel={() => setDraft(null)}
                remove={null}
                isPending={isPending}
              />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function DraftRow({
  draft,
  setDraft,
  save,
  cancel,
  remove,
  isPending,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  save: () => void;
  cancel: () => void;
  remove: (() => void) | null;
  isPending: boolean;
}) {
  return (
    <div className="grid sm:grid-cols-[1fr_120px_140px_auto] gap-3 items-end">
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Label
        </span>
        <input
          type="text"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          disabled={isPending}
          placeholder="Mid (10-50 employees)"
          className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Tier key
        </span>
        <input
          type="text"
          value={draft.tierKey}
          onChange={(e) => setDraft({ ...draft, tierKey: e.target.value })}
          disabled={isPending}
          placeholder="mid"
          className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue font-mono"
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Monthly fee
        </span>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tbb-ink-3 pointer-events-none">
            $
          </span>
          <input
            type="number"
            min="0"
            step="50"
            value={draft.monthlyFeeDollars}
            onChange={(e) =>
              setDraft({ ...draft, monthlyFeeDollars: e.target.value })
            }
            disabled={isPending}
            placeholder="1500"
            className="w-full bg-white border border-tbb-line rounded-md pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </div>
      </label>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <Save className="w-3.5 h-3.5" aria-hidden />
          )}
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="text-tbb-ink-3 hover:text-tbb-navy"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
        {remove && (
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="text-tbb-danger hover:text-tbb-danger/80"
            aria-label="Delete tier"
          >
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
