"use client";

/**
 * Pick the QuickBooks service item and tax code the retainer bills against.
 *
 * Chosen once, used for every client. A QBO invoice line requires an
 * ItemRef, the id is specific to this QuickBooks file, and choosing per
 * invoice would scatter coaching revenue across whatever item somebody
 * happened to click.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import {
  listQboBillingOptions,
  saveQboBillingDefaults,
} from "@/lib/actions/qbo-billing";

type Option = { Id: string; Name: string };

export function QboBillingDefaults({
  initialItemId,
  initialItemName,
  initialTaxCodeId,
  initialTaxCodeName,
}: {
  initialItemId: string | null;
  initialItemName: string | null;
  initialTaxCodeId: string | null;
  initialTaxCodeName: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Option[]>([]);
  const [taxCodes, setTaxCodes] = useState<Option[]>([]);
  const [itemId, setItemId] = useState(initialItemId ?? "");
  const [taxCodeId, setTaxCodeId] = useState(initialTaxCodeId ?? "");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Loaded on demand rather than on every render: it is two live calls to
  // Intuit, and the saved names below already show the current choice.
  useEffect(() => {
    if (!loading) return;
    void (async () => {
      const r = await listQboBillingOptions();
      setLoading(false);
      if (!r.ok) {
        setLoadError(r.error);
        return;
      }
      setItems(r.data.items);
      setTaxCodes(r.data.taxCodes);
    })();
  }, [loading]);

  function save() {
    setMsg(null);
    const item = items.find((i) => i.Id === itemId);
    const tax = taxCodes.find((t) => t.Id === taxCodeId);
    startTransition(async () => {
      const r = await saveQboBillingDefaults({
        itemId: itemId || null,
        itemName: item?.Name ?? initialItemName ?? null,
        taxCodeId: taxCodeId || null,
        taxCodeName: tax?.Name ?? initialTaxCodeName ?? null,
      });
      setMsg(r.ok ? "Saved." : r.error);
      if (r.ok) router.refresh();
    });
  }

  const loaded = items.length > 0 || taxCodes.length > 0;

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-4">
      <div className="space-y-1">
        <h2 className="font-bold text-foreground text-lg tracking-tight">
          Retainer billing
        </h2>
        <p className="font-sans text-sm text-tbb-ink-2">
          Which QuickBooks item a monthly retainer is billed against. Used for
          every client, so the revenue always lands in the same account.
        </p>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
            Service item
          </dt>
          <dd className="font-sans text-foreground">
            {initialItemName ?? <span className="text-tbb-danger">Not set</span>}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
            Tax code
          </dt>
          <dd className="font-sans text-foreground">
            {initialTaxCodeName ?? <span className="text-tbb-ink-3">None</span>}
          </dd>
        </div>
      </dl>

      {!loaded ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              setLoading(true);
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3.5 py-2 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-cream-50 disabled:opacity-50"
          >
            {loading && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            )}
            {loading ? "Reading QuickBooks…" : "Load from QuickBooks"}
          </button>
          {loadError && (
            <p className="font-sans text-xs text-tbb-danger">{loadError}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
              Service item
            </span>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              disabled={isPending}
              className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            >
              <option value="">— Choose an item —</option>
              {items.map((i) => (
                <option key={i.Id} value={i.Id}>
                  {i.Name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
              Tax code (optional)
            </span>
            <select
              value={taxCodeId}
              onChange={(e) => setTaxCodeId(e.target.value)}
              disabled={isPending}
              className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            >
              <option value="">— None —</option>
              {taxCodes.map((t) => (
                <option key={t.Id} value={t.Id}>
                  {t.Name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="w-3.5 h-3.5" aria-hidden />
            )}
            Save
          </button>
        </div>
      )}
      {msg && <p className="font-sans text-xs text-tbb-ink-2">{msg}</p>}
    </section>
  );
}
