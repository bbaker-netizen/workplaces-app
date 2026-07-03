"use client";

/**
 * Pipedrive-style Kanban board for the Pipeline. A column per working
 * stage; prospect cards drag between columns and dropping a card changes
 * its stage (via updateProspect). Native HTML5 drag-and-drop — no extra
 * dependency. Optimistic move with revert on failure.
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
// prospect lands somewhere. Dropping a card sets the column's real status.
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

  const columns = useMemo(() => {
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
    // Columns flex to fill the width so the board fits the screen with no
    // horizontal scroll on desktop. On very narrow screens they hit their
    // min-width and the container scrolls as a graceful fallback.
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-1.5 items-start">
        {columns.map(({ status, items }) => {
          const style = STAGE_STYLES[status];
          const active = dragOverCol === status;
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(status);
              }}
              onDragLeave={() => setDragOverCol((c) => (c === status ? null : c))}
              onDrop={() => drop(status)}
              className={
                "flex-1 min-w-[104px] rounded-lg border p-1.5 transition-colors " +
                (active
                  ? "border-tbb-blue bg-tbb-blue-50"
                  : "border-tbb-line bg-tbb-cream/40")
              }
            >
              {/* Header on a single line — dot + truncating label + count —
                  so long stage names (e.g. "Appt completed – follow-up")
                  never wrap to two rows in a narrow column. */}
              <div className="flex items-center gap-1.5 px-1.5 py-1.5 min-w-0">
                <span
                  aria-hidden
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: style.dotHex }}
                />
                <span
                  title={style.label}
                  className={
                    "flex-1 min-w-0 truncate whitespace-nowrap text-[10px] font-bold uppercase tracking-tbb-caps " +
                    style.textClass
                  }
                >
                  {style.label}
                </span>
                <span className="text-[11px] font-mono text-tbb-ink-3 shrink-0">
                  {items.length}
                </span>
              </div>

              <div className="space-y-2 min-h-[60px]">
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
                        "group relative rounded-md border border-tbb-line bg-white p-2 shadow-tbb-sm cursor-grab active:cursor-grabbing " +
                        (dragId === p.id ? "opacity-50" : "hover:border-tbb-blue")
                      }
                    >
                      <GripVertical
                        className="absolute right-1 top-1.5 w-3 h-3 text-tbb-line group-hover:text-tbb-ink-3"
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
                  <p className="text-[11px] text-tbb-ink-3 italic px-1.5 py-3 text-center">
                    Drop here
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
