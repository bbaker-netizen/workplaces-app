"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  createSubscription,
  deleteSubscription,
  updateSubscription,
} from "@/lib/actions/subscriptions";

const MODEL_LABEL: Record<string, string> = {
  model_a: "Model A · transferred at end",
  model_b: "Model B · client-owned",
  model_c: "Model C · Workplaces-maintained",
};

const TRANSFER_LABEL: Record<string, string> = {
  retained: "Retained",
  pending_transfer: "Transfer pending",
  transferred: "Transferred",
};

type Item = {
  id: string;
  name: string;
  vendor: string;
  monthlyCostCents: number;
  currency: string;
  paidBy: string;
  model: "model_a" | "model_b" | "model_c";
  transferStatus: "retained" | "pending_transfer" | "transferred";
  notes: string | null;
  renewalDate: Date | null;
};

export function SubscriptionsManager({
  engagementId,
  items,
  canEdit,
}: {
  engagementId: string;
  items: Item[];
  canEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{
    name: string;
    vendor: string;
    monthlyCost: string;
    currency: string;
    paidBy: string;
    model: "model_a" | "model_b" | "model_c";
    transferStatus: "retained" | "pending_transfer" | "transferred";
    notes: string;
    renewalDate: string;
  }>({
    name: "",
    vendor: "",
    monthlyCost: "",
    currency: "CAD",
    paidBy: "workplaces",
    model: "model_c",
    transferStatus: "retained",
    notes: "",
    renewalDate: "",
  });

  const submitNew = () => {
    if (!draft.name.trim() || !draft.vendor.trim()) {
      setError("Name and vendor are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const cents = Math.round(parseFloat(draft.monthlyCost || "0") * 100);
      const result = await createSubscription({
        engagementId,
        name: draft.name.trim(),
        vendor: draft.vendor.trim(),
        monthlyCostCents: Number.isFinite(cents) ? cents : 0,
        currency: draft.currency,
        paidBy: draft.paidBy,
        model: draft.model,
        transferStatus: draft.transferStatus,
        notes: draft.notes || null,
        renewalDate: draft.renewalDate || null,
      });
      if (!result.ok) setError(result.error);
      else {
        setAdding(false);
        setDraft({
          name: "",
          vendor: "",
          monthlyCost: "",
          currency: "CAD",
          paidBy: "workplaces",
          model: "model_c",
          transferStatus: "retained",
          notes: "",
          renewalDate: "",
        });
      }
    });
  };

  const onChangeStatus = (
    id: string,
    next: "retained" | "pending_transfer" | "transferred",
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await updateSubscription(id, { transferStatus: next });
      if (!result.ok) setError(result.error);
    });
  };

  const onDelete = (id: string, name: string) => {
    if (!window.confirm(`Remove "${name}" from the inventory?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSubscription(id);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="space-y-4">
      {items.length === 0 && !adding ? (
        <div className="border border-[#CCCCCC] rounded-md bg-white p-6 space-y-2">
          <p className="font-display font-bold text-foreground text-base tracking-tight">
            Nothing logged yet
          </p>
          <p className="font-sans text-sm text-muted-foreground">
            {canEdit
              ? "Track every external service you maintain for this engagement so transfer is painless when the time comes."
              : "Your coach will list services maintained on your behalf here."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#CCCCCC] border-t border-b border-[#CCCCCC]">
          {items.map((s) => (
            <li key={s.id} className="py-3 flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                  <span className="font-display font-bold text-foreground text-base tracking-tight">
                    {s.name}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                    {s.vendor}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  <span>
                    ${(s.monthlyCostCents / 100).toFixed(2)} {s.currency}/mo
                  </span>
                  <span>· paid by {s.paidBy}</span>
                  <span>· {MODEL_LABEL[s.model] ?? s.model}</span>
                  {s.renewalDate && (
                    <span>
                      · renews{" "}
                      {new Date(s.renewalDate).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
                {s.notes && (
                  <p className="mt-1 font-sans text-sm text-muted-foreground line-clamp-2">
                    {s.notes}
                  </p>
                )}
              </div>
              {canEdit ? (
                <select
                  value={s.transferStatus}
                  onChange={(e) =>
                    onChangeStatus(
                      s.id,
                      e.target.value as Item["transferStatus"],
                    )
                  }
                  disabled={isPending}
                  className="font-mono text-[10px] uppercase tracking-[0.15em] bg-white border border-[#CCCCCC] rounded-full px-2 py-1 cursor-pointer"
                >
                  <option value="retained">Retained</option>
                  <option value="pending_transfer">Transfer pending</option>
                  <option value="transferred">Transferred</option>
                </select>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  {TRANSFER_LABEL[s.transferStatus]}
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onDelete(s.id, s.name)}
                  disabled={isPending}
                  aria-label={`Remove ${s.name}`}
                  className="p-1.5 rounded text-muted-foreground hover:text-[#E87722] hover:bg-[#F5F1E8]"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057]"
        >
          <Plus className="w-4 h-4" aria-hidden /> Add subscription
        </button>
      )}

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitNew();
          }}
          className="border border-[#CCCCCC] rounded-md bg-white p-4 space-y-3"
        >
          <h3 className="font-display font-bold text-foreground text-lg tracking-tight">
            Add subscription
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Display name (e.g. Impactica · Netlify)"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              disabled={isPending}
              className="bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
            />
            <input
              required
              placeholder="Vendor (Netlify, Make.com, …)"
              value={draft.vendor}
              onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              disabled={isPending}
              className="bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Monthly cost"
              value={draft.monthlyCost}
              onChange={(e) =>
                setDraft({ ...draft, monthlyCost: e.target.value })
              }
              disabled={isPending}
              className="bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
            />
            <input
              maxLength={3}
              value={draft.currency}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  currency: e.target.value.toUpperCase().slice(0, 3),
                })
              }
              disabled={isPending}
              className="bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
            />
            <input
              placeholder="Paid by (workplaces / client / split)"
              value={draft.paidBy}
              onChange={(e) => setDraft({ ...draft, paidBy: e.target.value })}
              disabled={isPending}
              className="bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
            />
            <input
              type="date"
              placeholder="Renewal date"
              value={draft.renewalDate}
              onChange={(e) =>
                setDraft({ ...draft, renewalDate: e.target.value })
              }
              disabled={isPending}
              className="bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
            />
            <select
              value={draft.model}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  model: e.target.value as Item["model"],
                })
              }
              disabled={isPending}
              className="bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
            >
              <option value="model_c">Model C · Workplaces-maintained</option>
              <option value="model_b">Model B · client-owned</option>
              <option value="model_a">Model A · transferred at end</option>
            </select>
            <select
              value={draft.transferStatus}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  transferStatus: e.target.value as Item["transferStatus"],
                })
              }
              disabled={isPending}
              className="bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
            >
              <option value="retained">Retained</option>
              <option value="pending_transfer">Transfer pending</option>
              <option value="transferred">Transferred</option>
            </select>
          </div>
          <textarea
            placeholder="Notes (login URL, contact, history…)"
            rows={3}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057] resize-y"
          />
          {error && (
            <p
              role="alert"
              className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={isPending}
              className="font-sans text-xs uppercase tracking-[0.15em] px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      {error && !adding && (
        <p role="alert" className="font-sans text-sm text-[#E87722]">
          {error}
        </p>
      )}
    </div>
  );
}
