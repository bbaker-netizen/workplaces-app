"use client";

/**
 * Deal info card — expected value, lead source, owner, next action,
 * last contact. All inline-editable via a small drawer per field.
 */

import { useState, useTransition } from "react";
import { CalendarClock, Edit2, UserCircle2 } from "lucide-react";
import { updateProspect } from "@/lib/actions/prospects";
import { LEAD_SOURCES } from "@/lib/pipeline/stages";
import { formatCad } from "@/lib/format";
import type { BusinessBuilderOption } from "@/lib/db/queries/user-profiles";

export function ProspectDealCard({
  prospectId,
  totalClientValueCents,
  leadSource,
  referrerName,
  ownerUserProfileId,
  ownerName,
  nextActionDate,
  nextActionNote,
  lastContactAt,
  programType,
  monthlyFeeCents,
  businessBuilders,
}: {
  prospectId: string;
  /** Lifetime payments received, synced from QuickBooks. Read-only. */
  totalClientValueCents: number | null;
  leadSource: string | null;
  referrerName: string | null;
  ownerUserProfileId: string | null;
  ownerName: string | null;
  nextActionDate: Date | null;
  nextActionNote: string | null;
  lastContactAt: Date | null;
  programType: string | null;
  monthlyFeeCents: number | null;
  businessBuilders: BusinessBuilderOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [programVal, setProgramVal] = useState(programType ?? "");
  const [monthlyDollars, setMonthlyDollars] = useState(
    monthlyFeeCents ? (monthlyFeeCents / 100).toString() : "",
  );
  const [sourceVal, setSourceVal] = useState(leadSource ?? "");
  const [referrerVal, setReferrerVal] = useState(referrerName ?? "");
  const [ownerVal, setOwnerVal] = useState(ownerUserProfileId ?? "");
  const [actionDate, setActionDate] = useState(
    nextActionDate
      ? new Date(nextActionDate).toISOString().slice(0, 10)
      : "",
  );
  const [actionNote, setActionNote] = useState(nextActionNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const referralChosen = sourceVal === "Referral";

  const dealDirty =
    programVal !== (programType ?? "") ||
    monthlyDollars !== (monthlyFeeCents ? (monthlyFeeCents / 100).toString() : "") ||
    sourceVal !== (leadSource ?? "") ||
    referrerVal !== (referrerName ?? "") ||
    ownerVal !== (ownerUserProfileId ?? "") ||
    actionDate !==
      (nextActionDate
        ? new Date(nextActionDate).toISOString().slice(0, 10)
        : "") ||
    actionNote !== (nextActionNote ?? "");

  function save() {
    setError(null);
    if (referralChosen && referrerVal.trim().length < 2) {
      setError("Add the referrer's name — Referral leads need a referrer.");
      return;
    }
    const monthlyNum = Number(monthlyDollars);
    const monthlyCents =
      monthlyDollars.trim() && Number.isFinite(monthlyNum) && monthlyNum >= 0
        ? Math.round(monthlyNum * 100)
        : null;
    startTransition(async () => {
      const r = await updateProspect({
        id: prospectId,
        leadSource: sourceVal || null,
        referrerName: referralChosen ? referrerVal.trim() : null,
        ownerUserProfileId: ownerVal || null,
        nextActionDate: actionDate || null,
        nextActionNote: actionNote.trim() || null,
        programType:
          programVal === "accelerator" || programVal === "implementer"
            ? programVal
            : null,
        monthlyFeeCents: monthlyCents,
      });
      if (!r.ok) setError(r.error);
      else setEditing(false);
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Deal
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
          >
            <Edit2 className="inline w-3 h-3 mr-1" aria-hidden /> Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Total client value">
            {totalClientValueCents !== null ? (
              <span className="tabular-nums font-bold text-tbb-navy">
                {formatCad(totalClientValueCents)}
              </span>
            ) : (
              <span className="text-tbb-ink-4">No QuickBooks link</span>
            )}
          </Field>
          <Field label="Program">
            {programType ? (
              <span className="text-tbb-navy capitalize">{programType}</span>
            ) : (
              <span className="text-tbb-ink-4">Not set</span>
            )}
          </Field>
          <Field label="Monthly fee">
            {monthlyFeeCents ? (
              <span className="tabular-nums font-bold text-tbb-navy">
                {formatCad(monthlyFeeCents)}
                <span className="font-normal text-tbb-ink-3">/mo</span>
              </span>
            ) : (
              <span className="text-tbb-ink-4">Not set</span>
            )}
          </Field>
          <Field label="Lead source">
            {leadSource ? (
              <span className="text-tbb-navy">{leadSource}</span>
            ) : (
              <span className="text-tbb-ink-4">Unknown</span>
            )}
          </Field>
          {leadSource === "Referral" && (
            <Field label="Referred by">
              {referrerName ? (
                <span className="text-tbb-navy">{referrerName}</span>
              ) : (
                <span className="text-tbb-ink-4">Unknown</span>
              )}
            </Field>
          )}
          <Field label="Owner">
            <UserCircle2 className="w-3.5 h-3.5 text-tbb-ink-3 inline mr-1" aria-hidden />
            <span className="text-tbb-navy">
              {ownerName || (
                <span className="text-tbb-ink-4">Unassigned</span>
              )}
            </span>
          </Field>
          <Field label="Last contact">
            {lastContactAt ? (
              <span className="text-tbb-navy">
                {new Date(lastContactAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            ) : (
              <span className="text-tbb-ink-4">Never</span>
            )}
          </Field>
          <Field label="Next action" className="col-span-2">
            <CalendarClock className="w-3.5 h-3.5 text-tbb-ink-3 inline mr-1" aria-hidden />
            {nextActionDate ? (
              <span className="text-tbb-navy">
                {new Date(nextActionDate).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                {nextActionNote && (
                  <span className="ml-2 text-tbb-ink-2">
                    — {nextActionNote}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-tbb-ink-4">No action scheduled</span>
            )}
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          <EditField label="Program">
            <select
              value={programVal}
              onChange={(e) => setProgramVal(e.target.value)}
              disabled={isPending}
              className={inputCls}
            >
              <option value="">Not set</option>
              <option value="accelerator">Accelerator</option>
              <option value="implementer">Implementer</option>
            </select>
          </EditField>
          <EditField label="Monthly fee (CAD)">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-tbb-ink-3">
                $
              </span>
              <input
                type="number"
                min="0"
                step="50"
                value={monthlyDollars}
                onChange={(e) => setMonthlyDollars(e.target.value)}
                disabled={isPending}
                placeholder="2500"
                className={inputCls + " pl-7"}
              />
            </div>
          </EditField>
          <EditField label="Owner (Business Builder)">
            <select
              value={ownerVal}
              onChange={(e) => setOwnerVal(e.target.value)}
              disabled={isPending}
              className={inputCls}
            >
              <option value="">Unassigned</option>
              {businessBuilders.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fullName}
                </option>
              ))}
            </select>
          </EditField>
          <EditField label="Lead source">
            <select
              value={sourceVal}
              onChange={(e) => setSourceVal(e.target.value)}
              disabled={isPending}
              className={inputCls}
            >
              <option value="">Unknown</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </EditField>
          {referralChosen && (
            <EditField label="Referred by (required)">
              <input
                value={referrerVal}
                onChange={(e) => setReferrerVal(e.target.value)}
                disabled={isPending}
                placeholder="Who referred them?"
                className={inputCls}
              />
              <span className="text-[11px] text-tbb-ink-3">
                They get a $50 thank-you gift if this becomes a client.
              </span>
            </EditField>
          )}
          <EditField label="Next action date">
            <input
              type="date"
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
              disabled={isPending}
              className={inputCls}
            />
          </EditField>
          <EditField label="Next action note">
            <input
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              disabled={isPending}
              placeholder="Follow up after the proposal call"
              className={inputCls}
            />
          </EditField>
          {error && (
            <p className="text-sm text-tbb-danger">{error}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (dealDirty && !window.confirm("Discard your unsaved changes?"))
                  return;
                setEditing(false);
              }}
              disabled={isPending}
              className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

const inputCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={"space-y-1 " + (className ?? "")}>
      <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function EditField({
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
