"use client";

/**
 * Pipeline table — the CRM list view.
 *
 * Tabular layout with the columns a Business Builder needs at a glance:
 * company, contact, email + phone, stage, expected value, next action,
 * owner, last contact, created. Each row links to the prospect detail
 * page; the inline status select is the one click target that doesn't
 * navigate.
 *
 * Phase 5 additions:
 *   • Columns menu — show / hide any column. Choices persist on the user.
 *   • Drag the edge of any column header to resize. Widths persist too.
 *   • Filter chips + search stay above the table for fast triage.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Columns3, Loader2, Search, Trash2, X } from "lucide-react";
import { ProspectStatusSelect } from "./ProspectStatusSelect";
import {
  STAGE_STYLES,
  type ProspectStatus,
} from "@/lib/pipeline/stages";
import type { PipelineProspect } from "@/lib/db/queries/prospects";
import type { PipelineColumnPrefs } from "@/lib/db/queries/user-prefs";
import { setPipelineColumnPrefs } from "@/lib/actions/user-prefs";
import { bulkDeleteProspects } from "@/lib/actions/prospects";
import {
  hidePendingFeedback,
  showPendingFeedback,
} from "@/components/layout/NavLoaderOverlay";

/* ------------------------------ Columns ------------------------------ */

type ColumnKey =
  | "company"
  | "contact"
  | "email"
  | "phone"
  | "stage"
  | "value"
  | "next_action"
  | "owner"
  | "last_contact"
  | "lead_source"
  | "website"
  | "industry"
  | "created";

type ColumnDef = {
  key: ColumnKey;
  label: string;
  defaultWidth: number; // px
  defaultVisible: boolean;
  alignRight?: boolean;
  /** Default to true. False = locked open (can't be hidden). */
  optional?: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: "company", label: "Company", defaultWidth: 220, defaultVisible: true, optional: false },
  { key: "contact", label: "Contact", defaultWidth: 160, defaultVisible: true },
  { key: "email", label: "Email", defaultWidth: 220, defaultVisible: true },
  { key: "phone", label: "Phone", defaultWidth: 140, defaultVisible: true },
  { key: "stage", label: "Stage", defaultWidth: 200, defaultVisible: true },
  { key: "value", label: "Value", defaultWidth: 110, defaultVisible: true, alignRight: true },
  { key: "next_action", label: "Next action", defaultWidth: 160, defaultVisible: true },
  { key: "owner", label: "Owner", defaultWidth: 140, defaultVisible: true },
  { key: "last_contact", label: "Last contact", defaultWidth: 120, defaultVisible: true },
  { key: "lead_source", label: "Lead source", defaultWidth: 140, defaultVisible: false },
  { key: "website", label: "Website", defaultWidth: 180, defaultVisible: false },
  { key: "industry", label: "Industry", defaultWidth: 140, defaultVisible: false },
  { key: "created", label: "Created", defaultWidth: 100, defaultVisible: true },
];

const COLUMN_BY_KEY: Record<ColumnKey, ColumnDef> = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c]),
) as Record<ColumnKey, ColumnDef>;

const DEFAULT_VISIBLE = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);
const DEFAULT_WIDTHS = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c.defaultWidth]),
) as Record<ColumnKey, number>;

const MIN_WIDTH = 60;
const MAX_WIDTH = 600;

/* ------------------------------ Component ------------------------------ */

export function ProspectTable({
  prospects,
  initialPrefs,
}: {
  prospects: PipelineProspect[];
  initialPrefs: PipelineColumnPrefs | null;
}) {
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<ProspectStatus | "all">("all");
  const [visible, setVisible] = useState<ColumnKey[]>(() => {
    const fromPrefs = (initialPrefs?.visible ?? []) as ColumnKey[];
    // Make sure non-optional columns are always present + only known keys.
    const allowed = new Set<ColumnKey>(COLUMNS.map((c) => c.key));
    const filtered = fromPrefs.filter((k) => allowed.has(k));
    const required = COLUMNS.filter((c) => c.optional === false).map((c) => c.key);
    const out = filtered.length > 0 ? filtered : DEFAULT_VISIBLE;
    for (const r of required) if (!out.includes(r)) out.unshift(r);
    return out;
  });
  const [widths, setWidths] = useState<Record<ColumnKey, number>>(() => {
    const fromPrefs = (initialPrefs?.widths ?? {}) as Record<string, number>;
    return { ...DEFAULT_WIDTHS, ...fromPrefs };
  });
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);

  // Bulk-select state. `selected` is a Set of prospect IDs the user
  // has ticked. The "Select all" checkbox at the top toggles every
  // currently-filtered row in or out. Bulk actions appear as a sticky
  // toolbar whenever the set is non-empty.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const router = useRouter();
  const [isBulkPending, startBulkTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prospects.filter((p) => {
      if (stageFilter !== "all" && p.status !== stageFilter) return false;
      if (!q) return true;
      return (
        p.companyName.toLowerCase().includes(q) ||
        (p.contactName ?? "").toLowerCase().includes(q) ||
        p.contactEmail.toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q) ||
        (p.leadSource ?? "").toLowerCase().includes(q) ||
        (p.companyWebsite ?? "").toLowerCase().includes(q) ||
        (p.industry ?? "").toLowerCase().includes(q)
      );
    });
  }, [prospects, query, stageFilter]);

  /* Persist preferences with a small debounce so dragging doesn't hit
     the server on every pixel. */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (nextVisible: ColumnKey[], nextWidths: Record<ColumnKey, number>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setPipelineColumnPrefs({
          visible: nextVisible,
          widths: nextWidths,
        });
      }, 400);
    },
    [],
  );
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function toggleColumn(key: ColumnKey) {
    setVisible((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      persist(next, widths);
      return next;
    });
  }

  function startResize(key: ColumnKey, startX: number) {
    const startWidth = widths[key] ?? COLUMN_BY_KEY[key].defaultWidth;
    function onMove(ev: PointerEvent) {
      const delta = ev.clientX - startX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setWidths((prev) => ({ ...prev, [key]: next }));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setWidths((latest) => {
        persist(visible, latest);
        return latest;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function resetToDefaults() {
    setVisible(DEFAULT_VISIBLE);
    setWidths({ ...DEFAULT_WIDTHS });
    persist(DEFAULT_VISIBLE, { ...DEFAULT_WIDTHS });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered(check: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (check) {
        for (const p of filtered) next.add(p.id);
      } else {
        for (const p of filtered) next.delete(p.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function bulkDelete() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (
      !window.confirm(
        `Delete ${count} prospect${count === 1 ? "" : "s"}?\n\n` +
          `Removes them from the pipeline along with their activity log + ` +
          `communications. This can't be undone.`,
      )
    )
      return;
    setBulkError(null);
    showPendingFeedback(`Deleting ${count} prospect${count === 1 ? "" : "s"}…`);
    startBulkTransition(async () => {
      const ids = Array.from(selected);
      const r = await bulkDeleteProspects(ids);
      hidePendingFeedback();
      if (!r.ok) {
        setBulkError(r.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  const visibleColumns = visible
    .map((k) => COLUMN_BY_KEY[k])
    .filter((c): c is ColumnDef => Boolean(c));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="relative flex-1 min-w-[240px] max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tbb-ink-3"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company, contact, email, phone…"
            className="w-full bg-white border border-tbb-line rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </label>
        <select
          value={stageFilter}
          onChange={(e) =>
            setStageFilter(e.target.value as ProspectStatus | "all")
          }
          className="bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        >
          <option value="all">All stages</option>
          {Object.entries(STAGE_STYLES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>

        {/* Columns menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setColumnsMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 bg-white border border-tbb-line rounded-md px-3 py-2 text-sm font-bold text-tbb-navy hover:bg-tbb-cream-50 focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          >
            <Columns3 className="w-4 h-4" aria-hidden />
            Columns
          </button>
          {columnsMenuOpen && (
            <>
              <div
                role="presentation"
                onClick={() => setColumnsMenuOpen(false)}
                className="fixed inset-0 z-30"
              />
              <div className="absolute right-0 mt-1 z-40 w-64 bg-white border border-tbb-line rounded-md shadow-tbb-md p-2 space-y-0.5">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Show columns
                </p>
                {COLUMNS.map((col) => {
                  const isVisible = visible.includes(col.key);
                  const locked = col.optional === false;
                  return (
                    <label
                      key={col.key}
                      className={
                        "flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer " +
                        (locked
                          ? "text-tbb-ink-3 cursor-not-allowed"
                          : "hover:bg-tbb-cream-50 text-tbb-navy")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={isVisible}
                        disabled={locked}
                        onChange={() => !locked && toggleColumn(col.key)}
                        className="rounded"
                      />
                      <span>{col.label}</span>
                      {locked && (
                        <span className="ml-auto text-[10px] uppercase tracking-tbb-caps text-tbb-ink-4">
                          required
                        </span>
                      )}
                    </label>
                  );
                })}
                <div className="border-t border-tbb-line-soft mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      resetToDefaults();
                      setColumnsMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded text-xs text-tbb-blue hover:bg-tbb-cream-50"
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <span className="text-xs text-tbb-ink-3 tabular-nums">
          {filtered.length} of {prospects.length}
        </span>
      </div>

      {/* Bulk-action toolbar — appears whenever any rows are ticked. */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="flex items-center gap-3 flex-wrap px-4 py-2.5 rounded-md border border-tbb-blue bg-tbb-blue-50"
        >
          <span className="text-sm font-bold text-tbb-navy">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={isBulkPending}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-white border border-tbb-danger text-tbb-danger hover:bg-tbb-danger hover:text-white transition-colors disabled:opacity-50"
          >
            {isBulkPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
            )}
            Delete selected
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={isBulkPending}
            className="inline-flex items-center gap-1 text-xs text-tbb-ink-3 hover:text-tbb-navy"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
            Clear selection
          </button>
          {bulkError && (
            <span
              role="alert"
              className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1 bg-white"
            >
              {bulkError}
            </span>
          )}
        </div>
      )}

      <div className="border border-tbb-line rounded-lg bg-white overflow-hidden shadow-tbb-sm">
        <div className="overflow-x-auto">
          <table
            className="text-sm"
            style={{
              tableLayout: "fixed",
              width:
                40 +
                visibleColumns.reduce(
                  (sum, c) => sum + (widths[c.key] ?? c.defaultWidth),
                  0,
                ),
              minWidth: "100%",
            }}
          >
            <colgroup>
              <col style={{ width: 40 }} />
              {visibleColumns.map((c) => (
                <col key={c.key} style={{ width: widths[c.key] ?? c.defaultWidth }} />
              ))}
            </colgroup>
            <thead className="bg-tbb-bg-soft border-b border-tbb-line-soft">
              <tr className="text-left">
                <th
                  scope="col"
                  className="px-3 py-2.5 select-none"
                  aria-label="Select all"
                >
                  <input
                    type="checkbox"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((p) => selected.has(p.id))
                    }
                    onChange={(e) => selectAllFiltered(e.target.checked)}
                    aria-label="Select all visible prospects"
                    className="w-4 h-4 align-middle"
                  />
                </th>
                {visibleColumns.map((c) => (
                  <th
                    key={c.key}
                    className={
                      "relative px-4 py-2.5 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 select-none " +
                      (c.alignRight ? "text-right" : "")
                    }
                  >
                    <span className="block truncate">{c.label}</span>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${c.label} column`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        (e.target as Element).setPointerCapture?.(e.pointerId);
                        startResize(c.key, e.clientX);
                      }}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-tbb-blue/40 active:bg-tbb-blue"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <ProspectRow
                  key={p.id}
                  prospect={p}
                  columns={visibleColumns}
                  isSelected={selected.has(p.id)}
                  onToggleSelected={() => toggleSelected(p.id)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={visibleColumns.length + 1}
                    className="px-4 py-8 text-center text-sm text-tbb-ink-3 italic"
                  >
                    No prospects match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProspectRow({
  prospect,
  columns,
  isSelected,
  onToggleSelected,
}: {
  prospect: PipelineProspect;
  columns: ColumnDef[];
  isSelected: boolean;
  onToggleSelected: () => void;
}) {
  const href = `/coach/pipeline/${prospect.id}`;
  return (
    <tr
      className={
        "border-b border-tbb-line-soft last:border-b-0 transition-colors duration-tbb-base " +
        (isSelected ? "bg-tbb-blue-50" : "hover:bg-tbb-cream-50")
      }
    >
      <td className="px-3 py-3 align-top">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelected}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${prospect.companyName}`}
          className="w-4 h-4 align-middle"
        />
      </td>
      {columns.map((c) => (
        <CellByKey key={c.key} keyName={c.key} prospect={prospect} href={href} />
      ))}
    </tr>
  );
}

function CellByKey({
  keyName,
  prospect,
  href,
}: {
  keyName: ColumnKey;
  prospect: PipelineProspect;
  href: string;
}) {
  switch (keyName) {
    case "company":
      return (
        <Td>
          <Link
            href={href}
            className="block font-bold text-tbb-navy hover:underline underline-offset-4 truncate"
          >
            {prospect.companyName}
          </Link>
        </Td>
      );
    case "contact":
      return (
        <Td>
          <Link href={href} className="block text-tbb-ink-2 hover:text-tbb-navy truncate">
            {prospect.contactName || <Dash />}
          </Link>
        </Td>
      );
    case "email":
      return (
        <Td>
          <a
            href={`mailto:${prospect.contactEmail}`}
            className="text-tbb-blue hover:underline underline-offset-4 truncate block"
            onClick={(e) => e.stopPropagation()}
            title={prospect.contactEmail}
          >
            {prospect.contactEmail}
          </a>
        </Td>
      );
    case "phone":
      return (
        <Td>
          {prospect.phone ? (
            <a
              href={`tel:${prospect.phone}`}
              className="text-tbb-blue hover:underline underline-offset-4 whitespace-nowrap"
              onClick={(e) => e.stopPropagation()}
            >
              {prospect.phone}
            </a>
          ) : (
            <Dash />
          )}
        </Td>
      );
    case "stage":
      return (
        <Td>
          <ProspectStatusSelect
            prospectId={prospect.id}
            current={prospect.status as ProspectStatus}
          />
        </Td>
      );
    case "value":
      return (
        <Td alignRight>
          {prospect.expectedValueCents ? (
            <span className="tabular-nums font-bold text-tbb-navy whitespace-nowrap">
              ${(prospect.expectedValueCents / 100).toLocaleString("en-CA", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </span>
          ) : (
            <Dash />
          )}
        </Td>
      );
    case "next_action":
      return (
        <Td>
          {prospect.nextActionDate ? (
            <Link
              href={href}
              className="text-tbb-ink-2 hover:text-tbb-navy whitespace-nowrap"
            >
              {new Date(prospect.nextActionDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
              {prospect.nextActionNote && (
                <span className="block text-[11px] text-tbb-ink-3 truncate">
                  {prospect.nextActionNote}
                </span>
              )}
            </Link>
          ) : (
            <Dash />
          )}
        </Td>
      );
    case "owner":
      return (
        <Td>
          <span className="text-tbb-ink-2 truncate block">
            {prospect.ownerName || (
              <span className="text-tbb-ink-4">Unassigned</span>
            )}
          </span>
        </Td>
      );
    case "last_contact":
      return (
        <Td>
          {prospect.lastContactAt ? (
            <span className="text-tbb-ink-2 whitespace-nowrap">
              {new Date(prospect.lastContactAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          ) : (
            <Dash />
          )}
        </Td>
      );
    case "lead_source":
      return (
        <Td>
          {prospect.leadSource ? (
            <span className="text-tbb-ink-2 truncate block">
              {prospect.leadSource}
            </span>
          ) : (
            <Dash />
          )}
        </Td>
      );
    case "website":
      return (
        <Td>
          {prospect.companyWebsite ? (
            <a
              href={prospect.companyWebsite}
              target="_blank"
              rel="noreferrer noopener"
              className="text-tbb-blue hover:underline underline-offset-4 truncate block"
              onClick={(e) => e.stopPropagation()}
            >
              {prospect.companyWebsite.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <Dash />
          )}
        </Td>
      );
    case "industry":
      return (
        <Td>
          {prospect.industry ? (
            <span className="text-tbb-ink-2 truncate block">
              {prospect.industry}
            </span>
          ) : (
            <Dash />
          )}
        </Td>
      );
    case "created":
      return (
        <Td>
          <span className="text-tbb-ink-3 whitespace-nowrap tabular-nums">
            {prospect.createdAt.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </Td>
      );
  }
}

function Td({
  children,
  alignRight,
}: {
  children: React.ReactNode;
  alignRight?: boolean;
}) {
  return (
    <td
      className={
        "px-4 py-3 align-top overflow-hidden " +
        (alignRight ? "text-right" : "")
      }
    >
      {children}
    </td>
  );
}

function Dash() {
  return <span className="text-tbb-ink-4">—</span>;
}
