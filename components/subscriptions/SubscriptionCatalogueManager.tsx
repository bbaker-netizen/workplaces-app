"use client";

/**
 * Inline create / edit / delete + "Assign to engagement" for
 * subscription products. Pattern matches the email templates manager:
 * left list of products, right pane editor, plus an Assign drawer per
 * row that drops a record into the engagement's subscription_assets.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, X, Send } from "lucide-react";
import {
  assignProductToEngagement,
  createSubscriptionProduct,
  deleteSubscriptionProduct,
  updateSubscriptionProduct,
} from "@/lib/actions/subscription-products";
import type { SubscriptionProduct } from "@/lib/db/schema";

type Draft = {
  id: string | null;
  name: string;
  vendor: string;
  description: string;
  defaultMonthly: string; // dollars
  currency: string;
  category: string;
  active: boolean;
};

const NEW_DRAFT: Draft = {
  id: null,
  name: "",
  vendor: "Workplaces",
  description: "",
  defaultMonthly: "50",
  currency: "CAD",
  category: "",
  active: true,
};

export function SubscriptionCatalogueManager({
  initialProducts,
  engagements,
}: {
  initialProducts: SubscriptionProduct[];
  engagements: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [assigning, setAssigning] = useState<null | {
    productId: string;
    engagementId: string;
    monthly: string;
    notes: string;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openNew() {
    setError(null);
    setOkMessage(null);
    setDraft({ ...NEW_DRAFT });
  }
  function openExisting(p: SubscriptionProduct) {
    setError(null);
    setOkMessage(null);
    setDraft({
      id: p.id,
      name: p.name,
      vendor: p.vendor,
      description: p.description ?? "",
      defaultMonthly: (p.defaultMonthlyCents / 100).toString(),
      currency: p.currency,
      category: p.category ?? "",
      active: p.active,
    });
  }

  function save() {
    if (!draft) return;
    setError(null);
    const cents = Math.round(Number(draft.defaultMonthly) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setError("Monthly price must be a positive number.");
      return;
    }
    startTransition(async () => {
      const payload = {
        name: draft.name.trim(),
        vendor: draft.vendor.trim() || "Workplaces",
        description: draft.description.trim() || null,
        defaultMonthlyCents: cents,
        currency: draft.currency.trim().toUpperCase() || "CAD",
        category: draft.category.trim() || null,
        active: draft.active,
      };
      const r = draft.id
        ? await updateSubscriptionProduct(draft.id, payload)
        : await createSubscriptionProduct(payload);
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
        "Delete this product? Per-client assignments stay; they just won't be linked to the catalogue anymore.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await deleteSubscriptionProduct(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (draft?.id === id) setDraft(null);
      router.refresh();
    });
  }

  function openAssign(product: SubscriptionProduct) {
    setError(null);
    setOkMessage(null);
    setAssigning({
      productId: product.id,
      engagementId: engagements[0]?.id ?? "",
      monthly: (product.defaultMonthlyCents / 100).toString(),
      notes: "",
    });
  }

  function submitAssign() {
    if (!assigning) return;
    setError(null);
    const cents = Math.round(Number(assigning.monthly) * 100);
    startTransition(async () => {
      const r = await assignProductToEngagement({
        productId: assigning.productId,
        engagementId: assigning.engagementId,
        monthlyCostCents: cents,
        notes: assigning.notes.trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOkMessage("✓ Assigned to the engagement.");
      setAssigning(null);
      router.refresh();
    });
  }

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <aside className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Your products
          </h2>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> New product
          </button>
        </div>

        {okMessage && (
          <p className="text-xs text-tbb-success font-bold">{okMessage}</p>
        )}

        {initialProducts.length === 0 && !draft ? (
          <div className="border border-tbb-line rounded-lg bg-white p-6 text-center space-y-2">
            <p className="text-2xl" aria-hidden>
              📦
            </p>
            <p className="font-bold text-tbb-navy">No products yet.</p>
            <p className="text-sm text-tbb-ink-3">
              Add the things you sell — &quot;Client portal hosting&quot;,
              &quot;Workflow automation&quot;, &quot;Monthly retainer&quot;,
              whatever.
            </p>
          </div>
        ) : (
          <ul className="border border-tbb-line rounded-lg bg-white divide-y divide-tbb-line-soft overflow-hidden">
            {initialProducts.map((p) => {
              const isActive = draft?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => openExisting(p)}
                    className={
                      "w-full text-left px-4 py-3 flex items-start gap-3 transition-colors " +
                      (isActive
                        ? "bg-tbb-blue-100"
                        : "hover:bg-tbb-cream-50")
                    }
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-tbb-navy truncate">
                        {p.name}
                      </span>
                      <span className="block text-xs text-tbb-ink-3 truncate">
                        {p.vendor} · ${(p.defaultMonthlyCents / 100).toFixed(2)}{" "}
                        {p.currency}/mo
                      </span>
                    </span>
                    {!p.active && (
                      <span className="text-[10px] font-bold uppercase tracking-tbb-caps bg-tbb-cream-200 text-tbb-ink-3 px-2 py-0.5 rounded-pill shrink-0">
                        Inactive
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="lg:col-span-3">
        {assigning ? (
          <div className="border border-tbb-line rounded-lg bg-white p-5 space-y-4 shadow-tbb-sm">
            <div className="flex items-center gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Assign to engagement
              </h2>
              <button
                type="button"
                onClick={() => setAssigning(null)}
                className="ml-auto text-tbb-ink-3 hover:text-tbb-navy"
                aria-label="Close"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>
            {engagements.length === 0 ? (
              <p className="text-sm text-tbb-ink-3 italic">
                No engagements yet — create one before assigning products.
              </p>
            ) : (
              <>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                    Engagement
                  </span>
                  <select
                    value={assigning.engagementId}
                    onChange={(e) =>
                      setAssigning({ ...assigning, engagementId: e.target.value })
                    }
                    disabled={isPending}
                    className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                  >
                    {engagements.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                    Monthly price (override default)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={assigning.monthly}
                    onChange={(e) =>
                      setAssigning({ ...assigning, monthly: e.target.value })
                    }
                    disabled={isPending}
                    className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                    Notes (optional)
                  </span>
                  <textarea
                    rows={3}
                    value={assigning.notes}
                    onChange={(e) =>
                      setAssigning({ ...assigning, notes: e.target.value })
                    }
                    disabled={isPending}
                    placeholder="Anything specific about this client's setup."
                    className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
                  />
                </label>
                {error && (
                  <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-tbb-cream-50">
                    {error}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={submitAssign}
                    disabled={isPending || !assigning.engagementId}
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
                  >
                    {isPending && (
                      <Loader2
                        className="w-3.5 h-3.5 animate-spin"
                        aria-hidden
                      />
                    )}
                    Assign
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssigning(null)}
                    disabled={isPending}
                    className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        ) : draft ? (
          <div className="border border-tbb-line rounded-lg bg-white p-5 space-y-4 shadow-tbb-sm">
            <div className="flex items-center gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                {draft.id ? "Edit product" : "New product"}
              </h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="ml-auto text-tbb-ink-3 hover:text-tbb-navy"
                aria-label="Close editor"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Name
                </span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft({ ...draft, name: e.target.value })
                  }
                  disabled={isPending}
                  placeholder="e.g. Client portal hosting"
                  className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Vendor / provider
                </span>
                <input
                  type="text"
                  value={draft.vendor}
                  onChange={(e) =>
                    setDraft({ ...draft, vendor: e.target.value })
                  }
                  disabled={isPending}
                  className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Default monthly price
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.defaultMonthly}
                  onChange={(e) =>
                    setDraft({ ...draft, defaultMonthly: e.target.value })
                  }
                  disabled={isPending}
                  className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Currency
                </span>
                <input
                  type="text"
                  value={draft.currency}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      currency: e.target.value.toUpperCase().slice(0, 3),
                    })
                  }
                  disabled={isPending}
                  className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Category (optional)
                </span>
                <input
                  type="text"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                  disabled={isPending}
                  placeholder="Hosting / Automation / Retainer"
                  className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                />
              </label>
              <label className="inline-flex items-center gap-2 mt-6 text-sm text-tbb-ink-2">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) =>
                    setDraft({ ...draft, active: e.target.checked })
                  }
                  disabled={isPending}
                />
                <span>Active (visible in the catalogue)</span>
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Description (optional)
              </span>
              <textarea
                rows={3}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                disabled={isPending}
                placeholder="What you'll deliver / what's included."
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
              />
            </label>

            {error && (
              <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-tbb-cream-50">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={isPending || !draft.name.trim()}
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
              >
                {isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                )}
                {draft.id ? "Save changes" : "Create product"}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={isPending}
                className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
              >
                Cancel
              </button>
              {draft.id && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const product = initialProducts.find(
                        (p) => p.id === draft.id,
                      );
                      if (product) openAssign(product);
                    }}
                    disabled={isPending}
                    className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-warning text-white hover:bg-tbb-warning/90"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden /> Assign to engagement
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(draft.id!)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-danger hover:bg-tbb-danger/10 px-2.5 py-1.5 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden /> Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-tbb-line rounded-lg bg-tbb-cream-50 p-10 text-center space-y-2">
            <p className="text-3xl" aria-hidden>
              📦
            </p>
            <p className="font-bold text-tbb-navy">
              Pick a product to edit, or build a new one.
            </p>
            <p className="text-sm text-tbb-ink-3">
              Once a product exists, hit <strong>Assign to engagement</strong>{" "}
              to drop it into a specific client&apos;s subscription list.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
