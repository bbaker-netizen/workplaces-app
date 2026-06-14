"use client";

/**
 * Links a pipeline client to a QuickBooks customer so the "Value" column
 * shows their lifetime payments. Lazy-loads the QBO customer list when
 * opened, lets the coach search + pick, and stores the link (caching the
 * payments total immediately).
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Loader2, Search, Unlink } from "lucide-react";
import {
  clearProspectQboCustomer,
  listQboCustomersAction,
  setProspectQboCustomer,
  type QboCustomerOption,
} from "@/lib/actions/qbo-customer-link";

function formatCents(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function ProspectQboCustomerPicker({
  prospectId,
  customerId,
  customerName,
  lifetimePaymentsCents,
  syncedAt,
  linkedAt,
}: {
  prospectId: string;
  customerId: string | null;
  customerName: string | null;
  lifetimePaymentsCents: number | null;
  syncedAt: string | null;
  linkedAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<QboCustomerOption[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const loadedRef = useRef(false);

  async function openPicker() {
    setOpen(true);
    setError(null);
    if (loadedRef.current) return;
    setLoading(true);
    const r = await listQboCustomersAction();
    setLoading(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    loadedRef.current = true;
    setCustomers(r.data);
  }

  function pick(c: QboCustomerOption) {
    setError(null);
    startTransition(async () => {
      const r = await setProspectQboCustomer(prospectId, c.id, c.name);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function unlink() {
    setError(null);
    startTransition(async () => {
      const r = await clearProspectQboCustomer(prospectId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers.slice(0, 100);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [customers, search]);

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          QuickBooks
        </h2>
        {customerId && !open && (
          <button
            type="button"
            onClick={openPicker}
            className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
          >
            Change
          </button>
        )}
      </div>

      {customerId ? (
        <div className="space-y-1">
          <p className="text-sm text-tbb-navy">
            Linked to{" "}
            <span className="font-bold">{customerName ?? "a customer"}</span>
          </p>
          {linkedAt && (
            <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-success">
              <Check className="w-3 h-3" aria-hidden /> Linked{" "}
              {new Date(linkedAt).toLocaleDateString("en-CA", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
          <p className="text-sm">
            <span className="text-tbb-ink-3">Lifetime payments: </span>
            <span className="tabular-nums font-bold text-tbb-navy">
              {formatCents(lifetimePaymentsCents)}
            </span>
          </p>
          {syncedAt && (
            <p className="text-[11px] text-tbb-ink-4">
              Synced {new Date(syncedAt).toLocaleString("en-CA")}
            </p>
          )}
          <button
            type="button"
            onClick={unlink}
            disabled={isPending}
            className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-danger disabled:opacity-50"
          >
            <Unlink className="w-3 h-3" aria-hidden /> Unlink
          </button>
        </div>
      ) : (
        !open && (
          <div className="space-y-2">
            <p className="text-sm text-tbb-ink-3">
              Link this client to their QuickBooks customer to show their
              lifetime payments as the pipeline Value.
            </p>
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
            >
              <Link2 className="w-4 h-4" aria-hidden /> Link QuickBooks customer
            </button>
          </div>
        )
      )}

      {open && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 border border-tbb-line rounded-md px-3 py-2">
            <Search className="w-3.5 h-3.5 text-tbb-ink-3" aria-hidden />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search QuickBooks customers…"
              className="w-full text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto border border-tbb-line rounded-md divide-y divide-tbb-line-soft">
            {loading ? (
              <p className="px-3 py-3 text-sm text-tbb-ink-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading
                customers from QuickBooks…
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-tbb-ink-3 italic">
                No matching customers.
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c)}
                  disabled={isPending}
                  className="w-full text-left px-3 py-2 hover:bg-tbb-cream-50 disabled:opacity-50 flex items-center justify-between gap-2"
                >
                  <span>
                    <span className="block text-sm font-bold text-tbb-navy">
                      {c.name}
                    </span>
                    {c.email && (
                      <span className="block text-xs text-tbb-ink-3">
                        {c.email}
                      </span>
                    )}
                  </span>
                  {c.id === customerId && (
                    <Check className="w-4 h-4 text-tbb-blue shrink-0" aria-hidden />
                  )}
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
          >
            Cancel
          </button>
        </div>
      )}

      {error && <p className="text-sm text-tbb-danger">{error}</p>}
    </section>
  );
}
