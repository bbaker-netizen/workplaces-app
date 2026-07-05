"use client";

/**
 * Pipeline board — the industry-standard horizontal Kanban (Pipedrive /
 * HubSpot style). Stages run left-to-right as fixed-width columns with
 * drag-and-drop; the row scrolls horizontally when many stages are open.
 *
 * To tame eleven stages, every column is COLLAPSIBLE: click a stage
 * header to fold it to a thin strip (its cards tuck away, the strip
 * still accepts drops), so you narrow the board to just the stages
 * you're working. Collapsed state is remembered per browser.
 *
 * Native HTML5 drag-and-drop — no extra dependency. Optimistic move with
 * revert on failure. Dropping into "Won" offers one-click onboarding.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { updateProspect } from "@/lib/actions/prospects";
import { activateProspectAsEngagement } from "@/lib/actions/activate-engagement";
import {
  STAGE_ORDER,
  STAGE_STYLES,
  type ProspectStatus,
} from "@/lib/pipeline/stages";
import type { PipelineProspect } from "@/lib/db/queries/prospects";

const COLLAPSE_KEY = "tbb_pipeline_collapsed";

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

/** A column's headline value — sum of monthly fees if any, else expected
 *  one-time value. Keeps the two from being added together misleadingly. */
function columnValue(items: PipelineProspect[]): string | null {
  const monthly = items.reduce((s, p) => s + (p.monthlyFeeCents ?? 0), 0);
  if (monthly > 0) return `${money(monthly)}/mo`;
  const oneTime = items.reduce((s, p) => s + (p.expectedValueCents ?? 0), 0);
  return money(oneTime);
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Click-and-drag to pan the board left/right, so you don't have to hunt
  // for the horizontal scrollbar. Mouse only — touch devices already swipe
  // natively — and it never starts on a card, header, or link, so card
  // drag-and-drop and clicks keep working.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pan = useRef({ active: false, startX: 0, startScroll: 0 });
  const [panning, setPanning] = useState(false);

  function onPanPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        '[draggable="true"], button, a, input, select, textarea, [role="button"]',
      )
    ) {
      return; // let cards, headers, and links do their own thing
    }
    const sc = scrollRef.current;
    if (!sc || sc.scrollWidth <= sc.clientWidth) return; // nothing to pan
    pan.current = { active: true, startX: e.clientX, startScroll: sc.scrollLeft };
    setPanning(true);
  }
  function onPanPointerMove(e: React.PointerEvent) {
    if (!pan.current.active || !scrollRef.current) return;
    scrollRef.current.scrollLeft =
      pan.current.startScroll - (e.clientX - pan.current.startX);
  }
  function endPan() {
    if (pan.current.active) {
      pan.current.active = false;
      setPanning(false);
    }
  }

  // Restore collapsed columns from the last visit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapse(status: ProspectStatus) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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
          // Land the coach on the new client's workspace with a next-steps
          // banner, so onboarding never ends in silence.
          router.push(
            `/business-builder/engagements/${r.data.engagementId}?onboarded=1`,
          );
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
    // Scroll box owns BOTH axes so the column headers can stick: a plain
    // overflow-x container coerces overflow-y to auto with no height, which
    // gives `position: sticky` nothing to pin against. A capped height makes
    // the vertical scroll real, so each stage header stays visible while you
    // scroll a long column and drag a card into it.
    <div
      ref={scrollRef}
      onPointerDown={onPanPointerDown}
      onPointerMove={onPanPointerMove}
      onPointerUp={endPan}
      onPointerLeave={endPan}
      className={
        "overflow-auto max-h-[78vh] pb-3 " +
        (panning ? "cursor-grabbing select-none" : "cursor-grab")
      }
    >
      <div className="flex gap-3 items-start">
        {columns.map(({ status, items }) => {
          const style = STAGE_STYLES[status];
          const active = dragOverCol === status;
          const isCollapsed = collapsed.has(status);
          const value = columnValue(items);

          // Collapsed → a thin, drop-friendly strip with vertical label.
          if (isCollapsed) {
            return (
              <button
                type="button"
                key={status}
                onClick={() => toggleCollapse(status)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(status);
                }}
                onDragLeave={() =>
                  setDragOverCol((c) => (c === status ? null : c))
                }
                onDrop={() => drop(status)}
                title={`${style.label} — click to expand`}
                style={{ borderTopColor: style.dotHex }}
                className={
                  "shrink-0 w-11 self-stretch min-h-[8rem] rounded-lg border border-t-4 flex flex-col items-center gap-2 py-2 transition-colors " +
                  (active
                    ? "border-tbb-blue bg-tbb-blue-50"
                    : "border-tbb-line bg-tbb-cream/60 hover:bg-tbb-cream")
                }
              >
                <ChevronRight
                  className="w-3.5 h-3.5 text-tbb-ink-3 shrink-0"
                  aria-hidden
                />
                <span className="text-[11px] font-mono text-tbb-ink-2">
                  {items.length}
                </span>
                <span
                  className={
                    "text-[10.5px] font-bold uppercase tracking-tbb-caps whitespace-nowrap " +
                    style.textClass
                  }
                  style={{ writingMode: "vertical-rl" }}
                >
                  {style.label}
                </span>
              </button>
            );
          }

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
              style={{ borderTopColor: style.dotHex }}
              className={
                "shrink-0 w-[270px] rounded-lg border border-t-4 p-2 transition-colors " +
                (active
                  ? "border-tbb-blue bg-tbb-blue-50"
                  : "border-tbb-line bg-tbb-cream/40")
              }
            >
              {/* Header — collapse toggle, dot, label, count + value.
                  Sticks to the top of the board scroll box so the stage
                  stays labelled while you scroll a long column and drag. */}
              <div className="sticky top-0 z-10 -mx-2 -mt-2 px-2 pt-2 pb-1 bg-tbb-cream/95 backdrop-blur-sm rounded-t">
                <button
                  type="button"
                  onClick={() => toggleCollapse(status)}
                  title="Click to collapse this stage"
                  className="w-full flex items-center gap-1.5 px-1 py-1.5 rounded hover:bg-white/60 transition-colors text-left"
                >
                  <ChevronDown
                    className="w-3.5 h-3.5 text-tbb-ink-3 shrink-0"
                    aria-hidden
                  />
                  <span
                    aria-hidden
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: style.dotHex }}
                  />
                  <span
                    className={
                      "flex-1 min-w-0 truncate text-[11px] font-bold uppercase tracking-tbb-caps " +
                      style.textClass
                    }
                  >
                    {style.label}
                  </span>
                  <span className="text-[11px] font-mono text-tbb-ink-3 shrink-0">
                    {items.length}
                  </span>
                </button>
                {value && (
                  <p className="px-1 text-[11px] font-bold text-tbb-navy">
                    {value}
                  </p>
                )}
              </div>

              <div className="space-y-2 min-h-[3rem]">
                {items.map((p) => {
                  const cardValue = money(p.monthlyFeeCents)
                    ? `${money(p.monthlyFeeCents)}/mo`
                    : money(p.expectedValueCents);
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => setDragId(null)}
                      className={
                        "group relative rounded-md border border-tbb-line bg-white p-2.5 shadow-tbb-sm cursor-grab active:cursor-grabbing " +
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
                          {cardValue && (
                            <span className="text-[11px] font-bold text-tbb-navy">
                              {cardValue}
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
