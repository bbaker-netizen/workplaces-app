"use client";

import { useState, useTransition } from "react";
import {
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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

const BILLING_LABEL: Record<string, string> = {
  qbo: "QuickBooks",
  stripe: "Stripe",
};

type BillingProvider = "qbo" | "stripe" | "none";

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
  billingProvider: string | null;
  qboInvoiceId: string | null;
  qboCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  billingExternalUrl: string | null;
};

type BillingDraft = {
  provider: BillingProvider;
  qboInvoiceId: string;
  qboCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  billingExternalUrl: string;
};

const EMPTY_BILLING: BillingDraft = {
  provider: "none",
  qboInvoiceId: "",
  qboCustomerId: "",
  stripeSubscriptionId: "",
  stripePriceId: "",
  billingExternalUrl: "",
};

function asProvider(s: string | null): BillingProvider {
  return s === "qbo" || s === "stripe" ? s : "none";
}

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
  const [billingFor, setBillingFor] = useState<string | null>(null);
  const [billingDraft, setBillingDraft] = useState<BillingDraft>(EMPTY_BILLING);
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
    billing: BillingDraft;
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
    billing: EMPTY_BILLING,
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
        billingProvider: draft.billing.provider,
        qboInvoiceId: draft.billing.qboInvoiceId.trim() || null,
        qboCustomerId: draft.billing.qboCustomerId.trim() || null,
        stripeSubscriptionId:
          draft.billing.stripeSubscriptionId.trim() || null,
        stripePriceId: draft.billing.stripePriceId.trim() || null,
        billingExternalUrl: draft.billing.billingExternalUrl.trim() || null,
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
          billing: EMPTY_BILLING,
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

  function openBillingFor(s: Item) {
    setBillingFor(s.id);
    setBillingDraft({
      provider: asProvider(s.billingProvider),
      qboInvoiceId: s.qboInvoiceId ?? "",
      qboCustomerId: s.qboCustomerId ?? "",
      stripeSubscriptionId: s.stripeSubscriptionId ?? "",
      stripePriceId: s.stripePriceId ?? "",
      billingExternalUrl: s.billingExternalUrl ?? "",
    });
  }

  function saveBilling(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await updateSubscription(id, {
        billingProvider: billingDraft.provider,
        qboInvoiceId: billingDraft.qboInvoiceId.trim() || null,
        qboCustomerId: billingDraft.qboCustomerId.trim() || null,
        stripeSubscriptionId:
          billingDraft.stripeSubscriptionId.trim() || null,
        stripePriceId: billingDraft.stripePriceId.trim() || null,
        billingExternalUrl: billingDraft.billingExternalUrl.trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBillingFor(null);
    });
  }

  return (
    <div className="space-y-4">
      {items.length === 0 && !adding ? (
        <div className="border border-tbb-line rounded-md bg-white p-6 space-y-2">
          <p className="font-bold text-foreground text-base tracking-tight">
            Nothing logged yet
          </p>
          <p className="font-sans text-sm text-muted-foreground">
            {canEdit
              ? "Track every external service you maintain for this engagement so transfer is painless when the time comes."
              : "Your Coach will list services maintained on your behalf here."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
          {items.map((s) => (
            <li key={s.id} className="py-3 space-y-2">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                    <span className="font-bold text-foreground text-base tracking-tight">
                      {s.name}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                      {s.vendor}
                    </span>
                    {s.billingProvider && (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-blue border border-tbb-blue/40 bg-tbb-blue/10 rounded-pill px-2 py-0.5">
                        Billed · {BILLING_LABEL[s.billingProvider] ?? s.billingProvider}
                        {s.billingExternalUrl && (
                          <a
                            href={s.billingExternalUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="hover:underline"
                            title="Open billing record"
                          >
                            <ExternalLink className="w-3 h-3" aria-hidden />
                          </a>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
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
                    className="font-mono text-[10px] uppercase tracking-tbb-caps bg-white border border-tbb-line rounded-full px-2 py-1 cursor-pointer"
                  >
                    <option value="retained">Retained</option>
                    <option value="pending_transfer">Transfer pending</option>
                    <option value="transferred">Transferred</option>
                  </select>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {TRANSFER_LABEL[s.transferStatus]}
                  </span>
                )}
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => openBillingFor(s)}
                      disabled={isPending}
                      title="Link billing"
                      className="p-1.5 rounded text-muted-foreground hover:text-tbb-blue hover:bg-tbb-cream-50"
                    >
                      <LinkIcon className="w-3.5 h-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id, s.name)}
                      disabled={isPending}
                      aria-label={`Remove ${s.name}`}
                      className="p-1.5 rounded text-muted-foreground hover:text-tbb-danger hover:bg-tbb-cream-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </>
                )}
              </div>

              {billingFor === s.id && (
                <BillingDrawer
                  draft={billingDraft}
                  setDraft={setBillingDraft}
                  onCancel={() => setBillingFor(null)}
                  onSave={() => saveBilling(s.id)}
                  pending={isPending}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
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
          className="border border-tbb-line rounded-md bg-white p-4 space-y-3"
        >
          <h3 className="font-bold text-foreground text-lg tracking-tight">
            Add subscription
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Display name (e.g. Impactica · Netlify)"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
            <input
              required
              placeholder="Vendor (Netlify, Make.com, …)"
              value={draft.vendor}
              onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
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
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
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
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
            <input
              placeholder="Paid by (workplaces / client / split)"
              value={draft.paidBy}
              onChange={(e) => setDraft({ ...draft, paidBy: e.target.value })}
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
            <input
              type="date"
              placeholder="Renewal date"
              value={draft.renewalDate}
              onChange={(e) =>
                setDraft({ ...draft, renewalDate: e.target.value })
              }
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
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
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
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
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            >
              <option value="retained">Retained</option>
              <option value="pending_transfer">Transfer pending</option>
              <option value="transferred">Transferred</option>
            </select>
          </div>

          <BillingDrawer
            draft={draft.billing}
            setDraft={(updater) =>
              setDraft((d) => ({
                ...d,
                billing:
                  typeof updater === "function" ? updater(d.billing) : updater,
              }))
            }
            heading="Billing (optional)"
            pending={isPending}
          />

          <textarea
            placeholder="Notes (login URL, contact, history…)"
            rows={3}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
          />
          {error && (
            <p
              role="alert"
              className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={isPending}
              className="font-sans text-xs uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      {error && !adding && billingFor === null && (
        <p role="alert" className="font-sans text-sm text-tbb-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Re-usable billing-link drawer. Used inline on the "add subscription"
 * form AND per-row when Bruce clicks the link icon next to an existing
 * subscription. Action buttons render only when `onSave` / `onCancel`
 * are provided (per-row mode); on the add form it's controlled by the
 * outer form's submit button.
 */
function BillingDrawer({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
  heading,
}: {
  draft: BillingDraft;
  setDraft: (
    updater: BillingDraft | ((d: BillingDraft) => BillingDraft),
  ) => void;
  onSave?: () => void;
  onCancel?: () => void;
  pending: boolean;
  heading?: string;
}) {
  const inputClass =
    "w-full bg-white border border-tbb-line rounded-md px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-tbb-blue";

  return (
    <div className="border border-tbb-line rounded-md bg-tbb-cream-50 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            {heading ?? "Billing link"}
          </p>
          <p className="text-[11px] text-tbb-ink-3">
            Point this subscription at its source-of-truth charge so you
            can click through to the invoice or subscription record.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="Close billing drawer"
            className="text-tbb-ink-3 hover:text-tbb-navy"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["none", "qbo", "stripe"] as BillingProvider[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() =>
              setDraft((d) => ({ ...d, provider: p }))
            }
            disabled={pending}
            className={
              "text-[11px] font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border transition-colors " +
              (draft.provider === p
                ? "bg-tbb-blue text-white border-tbb-blue"
                : "bg-white text-tbb-ink-2 border-tbb-line hover:border-tbb-blue")
            }
          >
            {p === "none" ? "Not billed" : BILLING_LABEL[p]}
          </button>
        ))}
      </div>

      {draft.provider === "qbo" && (
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              QBO recurring invoice id
            </span>
            <input
              value={draft.qboInvoiceId}
              onChange={(e) =>
                setDraft((d) => ({ ...d, qboInvoiceId: e.target.value }))
              }
              placeholder="e.g. 1024"
              disabled={pending}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              QBO customer id
            </span>
            <input
              value={draft.qboCustomerId}
              onChange={(e) =>
                setDraft((d) => ({ ...d, qboCustomerId: e.target.value }))
              }
              placeholder="e.g. 58"
              disabled={pending}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>
      )}

      {draft.provider === "stripe" && (
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Stripe subscription id
            </span>
            <input
              value={draft.stripeSubscriptionId}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  stripeSubscriptionId: e.target.value,
                }))
              }
              placeholder="sub_…"
              disabled={pending}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Stripe price id
            </span>
            <input
              value={draft.stripePriceId}
              onChange={(e) =>
                setDraft((d) => ({ ...d, stripePriceId: e.target.value }))
              }
              placeholder="price_…"
              disabled={pending}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>
      )}

      {draft.provider !== "none" && (
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Direct link (paste the URL of the invoice / subscription page)
          </span>
          <input
            type="url"
            value={draft.billingExternalUrl}
            onChange={(e) =>
              setDraft((d) => ({ ...d, billingExternalUrl: e.target.value }))
            }
            placeholder="https://…"
            disabled={pending}
            className={`mt-1 ${inputClass}`}
          />
        </label>
      )}

      {onSave && (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="font-sans text-xs uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
          >
            {pending && <Loader2 className="w-3 h-3 animate-spin" />}
            Save billing link
          </button>
        </div>
      )}
    </div>
  );
}
