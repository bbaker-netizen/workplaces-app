"use client";

/**
 * Pipeline board — a stacked-lane layout. Each stage is a full-width
 * horizontal lane (label on the left, cards flowing to the right), so
 * all eleven stages fit any screen with no horizontal scroll and stage
 * headers never truncate. Prospect cards drag between lanes; dropping a
 * card changes its stage (via updateProspect). Native HTML5
 * drag-and-drop — no extra dependency. Optimistic move with revert on
 * failure. Dropping into "Won" offers one-click onboarding.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { updateProspect } from "@/lib/actions/prospects";
import { activateProspectAsEngagement } from "@/lib/actions/activate-engagement";
import {
  STAGE_ORDER,
  STAGE_STYLES,
  type ProspectStatus,
} from "@/lib/pipeline/stages";
import type { PipelineProspect } from "@/lib/db/queries/prospects";

// Retired / off-board statuses map onto the nearest working column so every
// prospect lands somewhere. Dropping a card sets the lane's real status.
const STATUS_TO_COLUMN: Record<string, ProspectStatus> = {
  diagnostic_pending: "contact_attempted",
  diagnostic_complete: "first_contact",
  negotiation: "proposal_sent",
};

function columnFor(status: ProspectStatus): ProspectStatus {
  if (STAGE_ORDER.includes(status)) return status;
  return STATUS_TO_COLUMN[status] ?? "new_lead";
}

function money(cents: number | null | undefined): string | null {
  if (!cents || cents <= 0) return null;
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

export function ProspectBoard({
  prospects,
}: {
  prospects: PipelineProspect[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Local status overrides so a drop reflects instantly (optimistic).
  const [overrides, setOverrides] = useState<Record<string, ProspectStatus>>(
    {},
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ProspectStatus | null>(null);

  const statusOf = (p: PipelineProspect): ProspectStatus =>
    overrides[p.id] ?? (p.status as ProspectStatus);

  const lanes = useMemo(() => {
    const byCol = new Map<ProspectStatus, PipelineProspect[]>();
    for (const s of STAGE_ORDER) byCol.set(s, []);
    for (const p of prospects) {
      // Archived prospects are removed from the pipeline — never show them
      // on the board (matches the Table view's default).
      if (p.archivedAt) continue;
      const col = columnFor(statusOf(p));
      byCol.get(col)?.push(p);
    }
    return STAGE_ORDER.map((s) => ({ status: s, items: byCol.get(s) ?? [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospects, overrides]);

  function drop(target: ProspectStatus) {
    setDragOverCol(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const prospect = prospects.find((p) => p.id === id);
    if (!prospect) return;
    const currentCol = columnFor(statusOf(prospect));
    if (currentCol === target) return;

    const prev = statusOf(prospect);

    // Dropping into "Won" (onboarded) on a prospect that isn't an engagement
    // yet offers to start onboarding in one click — creating the client's
    // workspace — guarded by a confirm so a stray drop never provisions.
    if (target === "onboarded" && !prospect.convertedEngagementId) {
      const go = window.confirm(
        "Mark this client as Won and start onboarding now?\n\n" +
          "This creates their engagement workspace so you can set up their " +
          "portal. It does not email or invite the client yet — you'll do " +
          "that when you're ready.",
      );
      if (!go) return; // Leave the card where it was.
      setOverrides((o) => ({ ...o, [id]: target }));
      startTransition(async () => {
        const r = await activateProspectAsEngagement(id);
        if (!r.ok) {
          setOverrides((o) => ({ ...o, [id]: prev }));
          window.alert(`Couldn't start onboarding: ${r.error}`);
        } else {
          router.refresh();
        }
      });
      return;
    }

    setOverrides((o) => ({ ...o, [id]: target }));
    startTransition(async () => {
      const r = await updateProspect({ id, status: target });
      if (!r.ok) {
        // Revert.
        setOverrides((o) => ({ ...o, [id]: prev }));
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      {lanes.map(({ status, items }) => {
        const style = STAGE_STYLES[status];
        const active = dragOverCol === status;
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCol(status);
            }}
            onDragLeave={() =>
              setDragOverCol((c) => (c === status ? null : c))
            }
            onDrop={() => drop(status)}
            style={{ borderLeftColor: style.dotHex }}
            className={
              "flex flex-col sm:flex-row gap-2 rounded-lg border border-l-4 p-2 transition-colors " +
              (active
                ? "border-tbb-blue bg-tbb-blue-50"
                : "border-tbb-line bg-tbb-cream/40")
            }
          >
            {/* Stage label — a fixed column on desktop, full-width header on
                mobile. Gets the whole width it needs, so it never truncates. */}
            <div className="sm:w-44 sm:shrink-0 flex sm:flex-col items-center sm:items-start gap-2 sm:gap-0.5 px-1 sm:py-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  aria-hidden
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: style.dotHex }}
                />
                <span
                  className={
                    "text-[11px] font-bold uppercase tracking-tbb-caps " +
                    style.textClass
                  }
                >
                  {style.label}
                </span>
              </div>
              <span className="text-[11px] font-mono text-tbb-ink-3">
                {items.length}{" "}
                <span className="hidden sm:inline">
                  {items.length === 1 ? "prospect" : "prospects"}
                </span>
              </span>
            </div>

            {/* Cards flow left-to-right and wrap onto new rows — no sideways
                scroll. Each card keeps a comfortable fixed width. */}
            <div className="flex-1 flex flex-wrap gap-2 min-h-[2.75rem] content-start">
              {items.map((p) => {
                const value = money(p.monthlyFeeCents)
                  ? `${money(p.monthlyFeeCents)}/mo`
                  : money(p.expectedValueCents);
                return (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={() => setDragId(p.id)}
                    onDragEnd={() => setDragId(null)}
                    className={
                      "group relative w-full sm:w-56 rounded-md border border-tbb-line bg-white p-2.5 shadow-tbb-sm cursor-grab active:cursor-grabbing " +
                      (dragId === p.id
                        ? "opacity-50"
                        : "hover:border-tbb-blue")
                    }
                  >
                    <GripVertical
                      className="absolute right-1 top-2 w-3 h-3 text-tbb-line group-hover:text-tbb-ink-3"
                      aria-hidden
                    />
                    <Link
                      href={`/business-builder/pipeline/${p.id}`}
                      className="block pr-3"
                    >
                      <p className="font-bold text-tbb-navy text-sm leading-tight truncate">
                        {p.companyName}
                      </p>
                      {p.contactName && (
                        <p className="text-xs text-tbb-ink-3 truncate mt-0.5">
                          {p.contactName}
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        {value && (
                          <span className="text-[11px] font-bold text-tbb-navy">
                            {value}
                          </span>
                        )}
                        {p.leadSource && (
                          <span className="text-[10px] font-mono text-tbb-ink-3 truncate">
                            {p.leadSource}
                          </span>
                        )}
                      </div>
                      {p.ownerName && (
                        <p className="text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3 mt-1.5">
                          {p.ownerName}
                        </p>
                      )}
                    </Link>
                  </div>
                );
              })}
              {items.length === 0 && (
                <p className="text-[11px] text-tbb-ink-3 italic px-2 self-center">
                  Drop here
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
