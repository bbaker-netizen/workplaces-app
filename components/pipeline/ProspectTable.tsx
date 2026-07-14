"use client";

/**
 * Pipeline table — the CRM list view.
 *
 * Tabular layout with the columns a Coach needs at a glance:
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
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronDown,
  Columns3,
  Loader2,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { ProspectStatusSelect } from "./ProspectStatusSelect";
import {
  LEAD_SOURCES,
  STAGE_ORDER,
  STAGE_STYLES,
  type ProspectStatus,
  type DisqualificationReason,
} from "@/lib/pipeline/stages";
import type { PipelineProspect } from "@/lib/db/queries/prospects";
import type { PipelineColumnPrefs } from "@/lib/db/queries/user-prefs";
import { formatCad, formatPhone, normalizeWebsite } from "@/lib/format";
import { setPipelineColumnPrefs } from "@/lib/actions/user-prefs";
import {
  bulkDeleteProspects,
  bulkPermanentlyDeleteProspects,
  unarchiveProspect,
} from "@/lib/actions/prospects";
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
  | "program"
  | "value"
  | "monthly"
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
  // Stage column has a 164px chip + 32px cell padding = needs 196 to
  // never clip. 210 gives a tiny bit of breathing room.
  { key: "stage", label: "Stage", defaultWidth: 210, defaultVisible: true },
  { key: "program", label: "Program", defaultWidth: 130, defaultVisible: false },
  { key: "value", label: "Total value", defaultWidth: 110, defaultVisible: true, alignRight: true },
  { key: "monthly", label: "Monthly", defaultWidth: 110, defaultVisible: true, alignRight: true },
  { key: "next_action", label: "Next action", defaultWidth: 160, defaultVisible: true },
  { key: "owner", label: "Owner", defaultWidth: 140, defaultVisible: true },
  { key: "last_contact", label: "Last contact", defaultWidth: 120, defaultVisible: true },
  { key: "lead_source", label: "Lead source", defaultWidth: 140, defaultVisible: true },
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

/* -------------------------- Stage filter groups ------------------------- */

// Active engagements = won clients.
const CLIENT_STAGES: ProspectStatus[] = ["onboarded"];
// The prospect funnel = everyone still being worked toward becoming a
// client. Mirrors the old single-select "prospects" segment: every stage
// except signed deals, active engagements, and lost.
const FUNNEL_STAGES: ProspectStatus[] = STAGE_ORDER.filter(
  (s) => s !== "contract_signed" && s !== "onboarded" && s !== "lost",
);
// Stored in the stage-pref array to mean "the Archived view".
const ARCHIVED_SENTINEL = "__archived__";

function sameStages(
  a: Set<ProspectStatus>,
  b: readonly ProspectStatus[],
): boolean {
  if (a.size !== b.length) return false;
  for (const s of b) if (!a.has(s)) return false;
  return true;
}

/**
 * Read a persisted stage pref — the new array of stage keys OR a legacy
 * single string ("prospects" / "clients" / "all" / "archived" / a stage) —
 * into the multi-select model. Keeps every saved pipeline working across
 * the single→multi upgrade.
 */
function parseStagePref(raw: string | string[] | undefined): {
  stages: Set<ProspectStatus>;
  archived: boolean;
} {
  const valid = new Set<string>(STAGE_ORDER as readonly string[]);
  if (Array.isArray(raw)) {
    if (raw.includes(ARCHIVED_SENTINEL)) {
      return { stages: new Set(FUNNEL_STAGES), archived: true };
    }
    const picked = raw.filter((s): s is ProspectStatus => valid.has(s));
    return {
      stages: new Set(picked.length ? picked : FUNNEL_STAGES),
      archived: false,
    };
  }
  switch (raw) {
    case "archived":
      return { stages: new Set(FUNNEL_STAGES), archived: true };
    case "clients":
      return { stages: new Set(CLIENT_STAGES), archived: false };
    case "all":
      return { stages: new Set(STAGE_ORDER), archived: false };
    case "prospects":
    case undefined:
      return { stages: new Set(FUNNEL_STAGES), archived: false };
    default:
      return valid.has(raw)
        ? { stages: new Set([raw as ProspectStatus]), archived: false }
        : { stages: new Set(FUNNEL_STAGES), archived: false };
  }
}

/* ------------------------------ Component ------------------------------ */

export function ProspectTable({
  prospects,
  initialPrefs,
}: {
  prospects: PipelineProspect[];
  initialPrefs: PipelineColumnPrefs | null;
}) {
  const savedFilters = initialPrefs?.filters;
  const [query, setQuery] = useState("");
  // Stage filter — now multi-select. `stages` is the set of stage keys to
  // show; `archived` is the orthogonal Archived view. Default to the
  // prospect funnel (new leads + everyone being worked toward a client),
  // restored from the caller's saved per-user prefs when present.
  const initialStage = parseStagePref(savedFilters?.stage);
  const [stages, setStages] = useState<Set<ProspectStatus>>(
    initialStage.stages,
  );
  const [archived, setArchived] = useState<boolean>(initialStage.archived);
  const [stageMenuOpen, setStageMenuOpen] = useState(false);

  function toggleStage(k: ProspectStatus) {
    setStages((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  // Lead-source filter — "all" shows every source. Sits alongside the
  // stage filter so the board can be sliced by channel (Facebook Ads,
  // Website Form, Referral, …).
  const [sourceFilter, setSourceFilter] = useState<string>(
    savedFilters?.source ?? "all",
  );
  // Owner (Business Builder) filter — "all" shows every owner,
  // "__unassigned__" shows prospects with no owner set, otherwise a specific
  // owner's user_profile id. Lets a Business Builder see just their own book.
  const OWNER_UNASSIGNED = "__unassigned__";
  const [ownerFilter, setOwnerFilter] = useState<string>(
    savedFilters?.owner ?? "all",
  );
  const [sortBy, setSortBy] = useState<
    "company" | "updated" | "owner" | "signed"
  >(
    (savedFilters?.sort as
      | "company"
      | "updated"
      | "owner"
      | "signed"
      | undefined) ?? "updated",
  );
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
    const merged = { ...DEFAULT_WIDTHS, ...fromPrefs } as Record<ColumnKey, number>;
    // Auto-correct the stage column if a previously-saved width is
    // narrower than the chip needs. Stops the pill from clipping
    // when an old user pref shrunk the column before the chip was
    // fixed-width.
    if ((merged.stage ?? 0) < 196) merged.stage = 210;
    return merged;
  });
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  // Column drag-to-reorder. `dragKey` is the header being dragged.
  const [dragKey, setDragKey] = useState<ColumnKey | null>(null);

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
    const rows = prospects.filter((p) => {
      // Archived rows are hidden everywhere except the explicit
      // "Archived" view, which shows only them. Otherwise a row shows if
      // its stage is one of the (multi-)selected stages.
      const isArchived = Boolean(p.archivedAt);
      if (archived) {
        if (!isArchived) return false;
      } else {
        if (isArchived) return false;
        if (!stages.has(p.status as ProspectStatus)) return false;
      }
      if (sourceFilter !== "all" && (p.leadSource ?? "") !== sourceFilter) {
        return false;
      }
      if (ownerFilter !== "all") {
        if (ownerFilter === OWNER_UNASSIGNED) {
          if (p.ownerUserProfileId) return false;
        } else if (p.ownerUserProfileId !== ownerFilter) {
          return false;
        }
      }
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
    // Sort the visible rows: alphabetical by company, or most-recently
    // updated first.
    return [...rows].sort((a, b) => {
      if (sortBy === "updated") {
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      }
      if (sortBy === "owner") {
        // By Business Builder (owner). Unassigned sorts to the bottom,
        // then alphabetical by company within an owner.
        const ao = a.ownerName ?? "￿";
        const bo = b.ownerName ?? "￿";
        return (
          ao.localeCompare(bo) || a.companyName.localeCompare(b.companyName)
        );
      }
      if (sortBy === "signed") {
        // By date signed, most recent first. Unsigned sort to the bottom.
        const at = a.contractSignedAt
          ? new Date(a.contractSignedAt).getTime()
          : -Infinity;
        const bt = b.contractSignedAt
          ? new Date(b.contractSignedAt).getTime()
          : -Infinity;
        return bt - at;
      }
      return a.companyName.localeCompare(b.companyName);
    });
  }, [prospects, query, stages, archived, sourceFilter, ownerFilter, sortBy]);

  // Per-stage counts (active rows only) shown next to each checkbox.
  const stageCounts = useMemo(() => {
    const m = new Map<ProspectStatus, number>();
    for (const p of prospects) {
      if (p.archivedAt) continue;
      const s = p.status as ProspectStatus;
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }, [prospects]);

  // Summary label on the stage-filter button.
  const stageSummary = archived
    ? "Archived"
    : sameStages(stages, FUNNEL_STAGES)
      ? "Prospects"
      : sameStages(stages, CLIENT_STAGES)
        ? "Active engagements"
        : sameStages(stages, STAGE_ORDER)
          ? "All stages"
          : stages.size === 0
            ? "No stages"
            : `${stages.size} stages`;

  // Total monthly program fee across the rows currently shown — i.e. the
  // monthly revenue this view represents (respects the stage filter).
  const monthlyTotalCents = useMemo(
    () => filtered.reduce((sum, p) => sum + (p.monthlyFeeCents ?? 0), 0),
    [filtered],
  );

  const archivedCount = useMemo(
    () => prospects.filter((p) => p.archivedAt).length,
    [prospects],
  );
  const viewingArchived = archived;

  // Source dropdown options: the canonical list plus any legacy values
  // actually present on rows (so an old source isn't silently un-filterable).
  const sourceOptions = useMemo(() => {
    const set = new Set<string>(LEAD_SOURCES as readonly string[]);
    for (const p of prospects) if (p.leadSource) set.add(p.leadSource);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [prospects]);

  // Owner dropdown options — every Business Builder who owns at least one row
  // in the data, plus an "Unassigned" bucket when any row has no owner.
  const ownerOptions = useMemo(() => {
    const byId = new Map<string, string>();
    let hasUnassigned = false;
    for (const p of prospects) {
      if (p.ownerUserProfileId) {
        byId.set(p.ownerUserProfileId, p.ownerName ?? "(unknown)");
      } else {
        hasUnassigned = true;
      }
    }
    const owners = Array.from(byId, ([id, name]) => ({ id, name })).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    return { owners, hasUnassigned };
  }, [prospects]);

  /* Persist the chosen view (filter + search + sort) across reloads and
     navigations until the coach resets it. Hydrate from localStorage on
     mount (after first paint, to avoid an SSR mismatch), then mirror any
     change back. */
  const VIEW_KEY = "tbb.pipeline.view";
  const viewHydrated = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (raw) {
        const v = JSON.parse(raw) as {
          stages?: string[];
          archived?: boolean;
          stageFilter?: string; // legacy single-select value
          sourceFilter?: string;
          ownerFilter?: string;
          query?: string;
          sortBy?: string;
        };
        if (
          Array.isArray(v.stages) ||
          typeof v.archived === "boolean" ||
          typeof v.stageFilter === "string"
        ) {
          const parsed = parseStagePref(
            Array.isArray(v.stages) ? v.stages : v.stageFilter,
          );
          setStages(parsed.stages);
          setArchived(
            typeof v.archived === "boolean" ? v.archived : parsed.archived,
          );
        }
        if (typeof v.sourceFilter === "string")
          setSourceFilter(v.sourceFilter);
        if (typeof v.ownerFilter === "string")
          setOwnerFilter(v.ownerFilter);
        if (typeof v.query === "string") setQuery(v.query);
        if (
          v.sortBy === "company" ||
          v.sortBy === "updated" ||
          v.sortBy === "owner" ||
          v.sortBy === "signed"
        )
          setSortBy(v.sortBy);
      }
    } catch {
      /* ignore malformed/blocked storage */
    }
    viewHydrated.current = true;
  }, []);
  useEffect(() => {
    if (!viewHydrated.current) return;
    try {
      localStorage.setItem(
        VIEW_KEY,
        JSON.stringify({
          stages: Array.from(stages),
          archived,
          sourceFilter,
          ownerFilter,
          query,
          sortBy,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [stages, archived, sourceFilter, ownerFilter, query, sortBy]);

  const viewIsDefault =
    !archived &&
    sameStages(stages, FUNNEL_STAGES) &&
    sourceFilter === "all" &&
    ownerFilter === "all" &&
    query === "" &&
    sortBy === "updated";
  function resetView() {
    setStages(new Set(FUNNEL_STAGES));
    setArchived(false);
    setSourceFilter("all");
    setOwnerFilter("all");
    setQuery("");
    setSortBy("updated");
    try {
      localStorage.removeItem(VIEW_KEY);
    } catch {
      /* ignore */
    }
  }

  /* Persist preferences with a small debounce so dragging doesn't hit
     the server on every pixel. Filters are read from live refs so every
     save carries the current filter/sort selection alongside columns. */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stagePref: string[] = archived
    ? [ARCHIVED_SENTINEL]
    : Array.from(stages);
  const filterRef = useRef<{
    stage: string[];
    source: string;
    owner: string;
    sort: string;
  }>({
    stage: stagePref,
    source: sourceFilter,
    owner: ownerFilter,
    sort: sortBy,
  });
  filterRef.current = {
    stage: stagePref,
    source: sourceFilter,
    owner: ownerFilter,
    sort: sortBy,
  };
  const viewStateRef = useRef({ visible, widths });
  viewStateRef.current = { visible, widths };
  const persist = useCallback(
    (nextVisible: ColumnKey[], nextWidths: Record<ColumnKey, number>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setPipelineColumnPrefs({
          visible: nextVisible,
          widths: nextWidths,
          filters: {
            stage: filterRef.current.stage,
            source: filterRef.current.source,
            owner: filterRef.current.owner,
            sort: filterRef.current.sort,
          },
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

  // Save when a filter / sort changes, per user — skips the first render so
  // simply loading the page never overwrites saved prefs with defaults.
  const filtersHydrated = useRef(false);
  useEffect(() => {
    if (!filtersHydrated.current) {
      filtersHydrated.current = true;
      return;
    }
    persist(viewStateRef.current.visible, viewStateRef.current.widths);
  }, [stages, archived, sourceFilter, ownerFilter, sortBy, persist]);

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
    // Stage column has a fixed-width chip that overflows below ~196px.
    // Pin its minimum higher so the user can't drag-clip the pill.
    const minForCol = key === "stage" ? 196 : MIN_WIDTH;
    function onMove(ev: PointerEvent) {
      const delta = ev.clientX - startX;
      const next = Math.min(MAX_WIDTH, Math.max(minForCol, startWidth + delta));
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

  /** Move a column so it lands at the position of `toKey`. Persisted
   *  into the same ordered `visible` pref that drives render order. */
  function reorderColumn(fromKey: ColumnKey, toKey: ColumnKey) {
    if (fromKey === toKey) return;
    setVisible((prev) => {
      const from = prev.indexOf(fromKey);
      const to = prev.indexOf(toKey);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, fromKey);
      persist(next, widths);
      return next;
    });
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

  function bulkArchive() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (
      !window.confirm(
        `Archive ${count} prospect${count === 1 ? "" : "s"}?\n\n` +
          `They move to the Archived view — their activity log and ` +
          `communications are kept, and you can restore them anytime.`,
      )
    )
      return;
    setBulkError(null);
    showPendingFeedback(`Archiving ${count} prospect${count === 1 ? "" : "s"}…`);
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

  function bulkRestore() {
    if (selected.size === 0) return;
    const count = selected.size;
    setBulkError(null);
    showPendingFeedback(`Restoring ${count} prospect${count === 1 ? "" : "s"}…`);
    startBulkTransition(async () => {
      const ids = Array.from(selected);
      for (const id of ids) {
        const r = await unarchiveProspect(id);
        if (!r.ok) {
          hidePendingFeedback();
          setBulkError(r.error);
          return;
        }
      }
      hidePendingFeedback();
      setSelected(new Set());
      router.refresh();
    });
  }

  function bulkPermanentDelete() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (
      !window.confirm(
        `Permanently delete ${count} archived lead${count === 1 ? "" : "s"}?\n\n` +
          `This removes them and their activity logs from the app for good. ` +
          `It cannot be undone. Any converted clients in the selection are ` +
          `skipped (clients are archive-only).`,
      )
    )
      return;
    setBulkError(null);
    showPendingFeedback(`Deleting ${count} record${count === 1 ? "" : "s"}…`);
    startBulkTransition(async () => {
      const ids = Array.from(selected);
      const r = await bulkPermanentlyDeleteProspects(ids);
      hidePendingFeedback();
      if (!r.ok) {
        setBulkError(r.error);
        return;
      }
      if (r.data.skipped > 0) {
        setBulkError(
          `${r.data.deleted} deleted. ${r.data.skipped} skipped ` +
            `(clients or not archived).`,
        );
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
      {/* Sticky toolbar — search, filter, columns, and the bulk-action
          bar stay pinned at the top of the page while the list scrolls.
          z-30 (above the sticky table header's z-20) so the filter
          popovers open in front of the header rather than behind it. */}
      <div className="sticky top-0 z-30 bg-background pt-2 pb-2 space-y-3">
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
        {/* Stage filter — multi-select. Pick any combination of stages, or
            a preset (Prospects / Active engagements / All). Disabled while
            viewing Archived, which is an orthogonal mode. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setStageMenuOpen((v) => !v)}
            disabled={archived}
            aria-haspopup="true"
            aria-expanded={stageMenuOpen}
            className="inline-flex items-center gap-1.5 bg-white border border-tbb-line rounded-md px-3 py-2 text-sm text-tbb-navy hover:bg-tbb-cream-50 focus:outline-none focus:ring-2 focus:ring-tbb-blue disabled:opacity-50"
          >
            <SlidersHorizontal className="w-4 h-4 text-tbb-ink-3" aria-hidden />
            <span className="font-bold">{stageSummary}</span>
            <ChevronDown className="w-3.5 h-3.5 text-tbb-ink-3" aria-hidden />
          </button>
          {stageMenuOpen && !archived && (
            <>
              <div
                role="presentation"
                onClick={() => setStageMenuOpen(false)}
                className="fixed inset-0 z-30"
              />
              <div className="absolute left-0 mt-1 z-40 w-72 bg-white border border-tbb-line rounded-md shadow-tbb-md p-2 space-y-1">
                <div className="flex flex-wrap gap-1">
                  <StagePreset
                    label="Prospects"
                    active={sameStages(stages, FUNNEL_STAGES)}
                    onClick={() => setStages(new Set(FUNNEL_STAGES))}
                  />
                  <StagePreset
                    label="Active engagements"
                    active={sameStages(stages, CLIENT_STAGES)}
                    onClick={() => setStages(new Set(CLIENT_STAGES))}
                  />
                  <StagePreset
                    label="All"
                    active={sameStages(stages, STAGE_ORDER)}
                    onClick={() => setStages(new Set(STAGE_ORDER))}
                  />
                </div>
                <div className="border-t border-tbb-line-soft my-1" />
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                    Stages
                  </p>
                  {stages.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setStages(new Set())}
                      className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <label className="flex items-center gap-2 px-1 py-1.5 rounded text-sm cursor-pointer hover:bg-tbb-cream-50 font-bold text-tbb-navy">
                  <input
                    type="checkbox"
                    checked={stages.size === STAGE_ORDER.length}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          stages.size > 0 && stages.size < STAGE_ORDER.length;
                    }}
                    onChange={() =>
                      setStages(
                        stages.size === STAGE_ORDER.length
                          ? new Set()
                          : new Set(STAGE_ORDER),
                      )
                    }
                    className="rounded"
                  />
                  <span className="flex-1">Select all</span>
                </label>
                <div className="max-h-64 overflow-y-auto space-y-0.5">
                  {STAGE_ORDER.map((k) => {
                    const on = stages.has(k);
                    const st = STAGE_STYLES[k];
                    return (
                      <label
                        key={k}
                        className="flex items-center gap-2 px-1 py-1.5 rounded text-sm cursor-pointer hover:bg-tbb-cream-50"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleStage(k)}
                          className="rounded"
                        />
                        <span
                          aria-hidden
                          className="inline-block w-2.5 h-2.5 rounded-full ring-1 ring-tbb-line shrink-0"
                          style={{ backgroundColor: st.dotHex }}
                        />
                        <span className="flex-1 text-tbb-navy">{st.label}</span>
                        <span className="text-[10px] text-tbb-ink-3 tabular-nums">
                          {stageCounts.get(k) ?? 0}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          aria-label="Filter by lead source"
        >
          <option value="all">All sources</option>
          {sourceOptions.map((src) => (
            <option key={src} value={src}>
              {src}
            </option>
          ))}
        </select>
        {/* Owner (Business Builder) filter — slice the pipeline to a single
            owner's book, or the Unassigned bucket. */}
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          aria-label="Filter by owner (Business Builder)"
        >
          <option value="all">All owners</option>
          {ownerOptions.owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          {ownerOptions.hasUnassigned && (
            <option value={OWNER_UNASSIGNED}>Unassigned</option>
          )}
        </select>
        <select
          value={sortBy}
          onChange={(e) =>
            setSortBy(
              e.target.value as "company" | "updated" | "owner" | "signed",
            )
          }
          className="bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          aria-label="Sort rows"
        >
          <option value="company">Sort: Company A–Z</option>
          <option value="updated">Sort: Last updated</option>
          <option value="owner">Sort: Business Builder</option>
          <option value="signed">Sort: Date signed</option>
        </select>

        {/* Archived toggle — a one-click way in and out of the Archived
            view, so it isn't buried in the stage dropdown. */}
        {(archivedCount > 0 || viewingArchived) && (
          <button
            type="button"
            onClick={() => setArchived((v) => !v)}
            aria-pressed={viewingArchived}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-tbb-blue border " +
              (viewingArchived
                ? "bg-tbb-navy text-white border-tbb-navy hover:bg-tbb-navy/90"
                : "bg-white text-tbb-navy border-tbb-line hover:bg-tbb-cream-50")
            }
          >
            {viewingArchived ? (
              <>
                <ArchiveRestore className="w-4 h-4" aria-hidden />
                Back to active
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" aria-hidden />
                Archived ({archivedCount})
              </>
            )}
          </button>
        )}

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
                  <p className="px-2 py-1 text-[10px] text-tbb-ink-4">
                    Tip: drag a column header to reorder. Drag its right edge
                    to resize.
                  </p>
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

        {!viewIsDefault && (
          <button
            type="button"
            onClick={resetView}
            className="inline-flex items-center gap-1 text-xs font-bold text-tbb-blue hover:underline"
            title="Clear search, filter and sort back to the default view"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
            Reset view
          </button>
        )}

        <span className="text-xs text-tbb-ink-3 tabular-nums">
          {filtered.length} of {prospects.length}
          {monthlyTotalCents > 0 && (
            <>
              {" · "}
              <span className="font-bold text-tbb-navy">
                ${(monthlyTotalCents / 100).toLocaleString("en-CA", {
                  maximumFractionDigits: 0,
                })}
                /mo
              </span>{" "}
              total
            </>
          )}
        </span>
      </div>

      {/* Archived view — a clear way back so you're never stuck in the
          Archived list (the filter dropdown alone wasn't obvious). */}
      {viewingArchived && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2 rounded-md border border-tbb-line bg-tbb-cream-50">
          <span className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-2">
            Viewing archived records
          </span>
          <button
            type="button"
            onClick={() => setArchived(false)}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-white border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
            Back to Prospects &amp; Clients
          </button>
        </div>
      )}

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
          {viewingArchived ? (
            <>
              <button
                type="button"
                onClick={bulkRestore}
                disabled={isBulkPending}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-white border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white transition-colors disabled:opacity-50"
              >
                {isBulkPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <ArchiveRestore className="w-3.5 h-3.5" aria-hidden />
                )}
                Restore selected
              </button>
              <button
                type="button"
                onClick={bulkPermanentDelete}
                disabled={isBulkPending}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-danger text-white hover:bg-tbb-danger/90 transition-colors disabled:opacity-50"
              >
                {isBulkPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                )}
                Delete permanently
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={bulkArchive}
              disabled={isBulkPending}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-white border border-tbb-danger text-tbb-danger hover:bg-tbb-danger hover:text-white transition-colors disabled:opacity-50"
            >
              {isBulkPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <Archive className="w-3.5 h-3.5" aria-hidden />
              )}
              Archive selected
            </button>
          )}
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
      </div>

      <div className="border border-tbb-line rounded-lg bg-white overflow-hidden shadow-tbb-sm">
        {/* Bounded scroll area so the header can stick while you scroll the
            rows (and still drag columns to reorder). */}
        <div className="overflow-auto max-h-[70vh]">
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
            <thead className="sticky top-0 z-20 bg-tbb-bg-soft border-b border-tbb-line-soft [&_th]:bg-tbb-bg-soft">
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
                    draggable
                    onDragStart={(e) => {
                      setDragKey(c.key);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (dragKey && dragKey !== c.key) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragKey) reorderColumn(dragKey, c.key);
                      setDragKey(null);
                    }}
                    onDragEnd={() => setDragKey(null)}
                    title="Drag to reorder column"
                    className={
                      "relative px-4 py-2.5 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 select-none cursor-grab active:cursor-grabbing " +
                      (dragKey === c.key ? "opacity-50 " : "") +
                      (c.alignRight ? "text-right" : "")
                    }
                  >
                    <span className="block truncate">{c.label}</span>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${c.label} column`}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
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

/** A preset chip inside the stage multi-select that sets the whole
 *  selection at once (Prospects / Active engagements / All). */
function StagePreset({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "px-2.5 py-1 rounded-pill text-[11px] font-bold transition-colors duration-tbb-base " +
        (active
          ? "bg-tbb-blue text-white"
          : "bg-white border border-tbb-line text-tbb-ink-2 hover:border-tbb-blue")
      }
    >
      {label}
    </button>
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
  const href = `/business-builder/pipeline/${prospect.id}`;
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
              {formatPhone(prospect.phone)}
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
            companyName={prospect.companyName}
            currentReason={
              prospect.disqualifiedReason as DisqualificationReason | null
            }
            alreadyConverted={Boolean(prospect.convertedEngagementId)}
          />
        </Td>
      );
    case "program": {
      // The program the client is signed up for. The prospect's own
      // programType wins; fall back to the converted engagement's type.
      const raw = prospect.programType ?? prospect.engagementType ?? null;
      const label = raw
        ? raw.charAt(0).toUpperCase() + raw.slice(1)
        : null;
      return (
        <Td>
          {label ? (
            <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-tbb-caps px-2 py-0.5 rounded-pill bg-tbb-blue-50 text-tbb-navy border border-tbb-line whitespace-nowrap">
              {label}
            </span>
          ) : (
            <Dash />
          )}
        </Td>
      );
    }
    case "value": {
      // The client's lifetime payments from QuickBooks — a direct customer
      // link on the prospect, else a link via the converted engagement.
      const cents =
        prospect.qboLifetimePaymentsCents ??
        prospect.engagementQboLifetimePaymentsCents;
      return (
        <Td alignRight>
          {cents ? (
            <span
              className="tabular-nums font-bold text-tbb-navy whitespace-nowrap"
              title="Lifetime payments received (from QuickBooks)"
            >
              {formatCad(cents)}
              <span className="ml-1 align-middle text-[9px] font-bold uppercase tracking-tbb-caps text-tbb-blue">
                QB
              </span>
            </span>
          ) : (
            <Dash />
          )}
        </Td>
      );
    }
    case "monthly": {
      const cents = prospect.monthlyFeeCents;
      return (
        <Td alignRight>
          {cents ? (
            <span
              className="tabular-nums font-bold text-tbb-navy whitespace-nowrap"
              title="Monthly program fee this client pays"
            >
              {formatCad(cents)}
              <span className="font-normal text-tbb-ink-3">/mo</span>
            </span>
          ) : (
            <Dash />
          )}
        </Td>
      );
    }
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
              href={normalizeWebsite(prospect.companyWebsite) ?? "#"}
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
