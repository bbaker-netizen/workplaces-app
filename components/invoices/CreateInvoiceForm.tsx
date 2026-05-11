"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { createInvoice } from "@/lib/actions/invoices";

type LineDraft = {
  description: string;
  amountDollars: string;
};

export function CreateInvoiceForm({
  engagements,
  qboConnected,
}: {
  engagements: Array<{ id: string; name: string }>;
  qboConnected: boolean;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<"qbo" | "stripe">("qbo");
  const [engagementId, setEngagementId] = useState<string>(
    engagements[0]?.id ?? "",
  );
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [customerMemo, setCustomerMemo] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { description: "", amountDollars: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    invoiceId: string;
    hostedUrl: string | null;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function addLine() {
    if (lines.length >= 50) return;
    setLines([...lines, { description: "", amountDollars: "" }]);
  }
  function removeLine(idx: number) {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  }
  function updateLine(idx: number, key: keyof LineDraft, value: string) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  }

  function totalDollars(): number {
    return lines.reduce((sum, l) => {
      const n = Number(l.amountDollars);
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
  }

  function submit() {
    setError(null);
    if (!engagementId) {
      setError("Pick an engagement.");
      return;
    }
    const cleanLines: Array<{ description: string; amountCents: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.description.trim()) {
        setError(`Line ${i + 1} needs a description.`);
        return;
      }
      const n = Number(l.amountDollars);
      if (!Number.isFinite(n) || n <= 0) {
        setError(`Line ${i + 1} needs a positive dollar amount.`);
        return;
      }
      cleanLines.push({
        description: l.description.trim(),
        amountCents: Math.round(n * 100),
      });
    }
    startTransition(async () => {
      const result = await createInvoice({
        engagementId,
        provider,
        description: description.trim() || null,
        lines: cleanLines,
        dueDate: dueDate || null,
        customerMemo: customerMemo.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess({
        invoiceId: result.data.invoiceId,
        hostedUrl: result.data.hostedInvoiceUrl,
      });
      router.refresh();
    });
  }

  if (success) {
    return (
      <div className="border border-tbb-blue rounded-md bg-tbb-cream-50 p-6 text-center space-y-3">
        <CheckCircle2 className="w-10 h-10 mx-auto text-tbb-navy" aria-hidden />
        <p className="font-bold text-foreground text-2xl tracking-tight">
          Invoice created.
        </p>
        {success.hostedUrl ? (
          <p className="font-sans text-sm text-foreground">
            Open it in QuickBooks to send to the client:{" "}
            <a
              href={success.hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-tbb-navy underline underline-offset-4 break-all"
            >
              {success.hostedUrl}
            </a>
          </p>
        ) : (
          <p className="font-sans text-sm text-foreground">
            View the invoice in your provider&apos;s dashboard to send.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
      aria-busy={isPending}
    >
      <div className="space-y-1">
        <label className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Engagement <span className="text-tbb-danger">*</span>
        </label>
        <select
          required
          value={engagementId}
          onChange={(e) => setEngagementId(e.target.value)}
          disabled={isPending}
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        >
          {engagements.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground mb-1">
          Provider
        </legend>
        <div className="flex flex-wrap gap-2">
          <ProviderPill
            active={provider === "qbo"}
            onClick={() => setProvider("qbo")}
            label="QuickBooks (default)"
            disabled={!qboConnected}
            disabledHint={
              qboConnected ? null : "Connect QuickBooks first"
            }
          />
          <ProviderPill
            active={provider === "stripe"}
            onClick={() => setProvider("stripe")}
            label="Stripe (rare)"
          />
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground mb-1">
          Line items
        </legend>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto_auto] gap-2 items-start"
            >
              <input
                required
                value={l.description}
                onChange={(e) =>
                  updateLine(i, "description", e.target.value)
                }
                placeholder="Coaching retainer — May 2026"
                disabled={isPending}
                className="bg-white border border-tbb-line rounded-md px-3 py-1.5 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
              <div className="flex items-center gap-1">
                <span className="font-mono text-[11px] text-muted-foreground">
                  $
                </span>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={l.amountDollars}
                  onChange={(e) =>
                    updateLine(i, "amountDollars", e.target.value)
                  }
                  placeholder="0.00"
                  disabled={isPending}
                  className="w-28 bg-white border border-tbb-line rounded-md px-2 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue tabular-nums text-right"
                />
              </div>
              {lines.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  disabled={isPending}
                  aria-label={`Remove line ${i + 1}`}
                  className="p-1.5 text-tbb-danger hover:bg-tbb-cream-50 rounded-md disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                </button>
              ) : (
                <span className="w-7" />
              )}
            </div>
          ))}
        </div>
        <div className="flex items-baseline justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={addLine}
            disabled={isPending}
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-navy hover:underline"
          >
            <Plus className="w-3 h-3" aria-hidden /> Add line
          </button>
          <p className="font-mono text-[12px] text-foreground tabular-nums">
            Total: <strong>${totalDollars().toFixed(2)}</strong>
          </p>
        </div>
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Due date (optional)
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </div>
        <div className="space-y-1">
          <label className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Internal description (optional)
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isPending}
            placeholder="May retainer"
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Memo on the invoice (optional)
        </label>
        <textarea
          rows={2}
          value={customerMemo}
          onChange={(e) => setCustomerMemo(e.target.value)}
          disabled={isPending}
          placeholder="Thanks for your business."
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
      >
        {isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
        {isPending ? "Creating…" : "Create invoice"}
      </button>
    </form>
  );
}

function ProviderPill({
  active,
  onClick,
  label,
  disabled,
  disabledHint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  disabledHint?: string | null;
}) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={
          "font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-md border transition-colors " +
          (active
            ? "bg-tbb-blue text-white border-tbb-navy"
            : "bg-white text-foreground border-tbb-line hover:bg-tbb-cream-50 disabled:opacity-50 disabled:cursor-not-allowed")
        }
      >
        {label}
      </button>
      {disabled && disabledHint && (
        <span className="font-mono text-[9px] uppercase tracking-tbb-caps text-muted-foreground">
          {disabledHint}
        </span>
      )}
    </span>
  );
}
