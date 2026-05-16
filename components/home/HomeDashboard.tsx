"use client";

/**
 * HomeDashboard — Monday-style customizable home page.
 *
 * The Business Builder Console home renders a grid of info cards.
 * The user can:
 *   • Drag a card by its header to rearrange the grid.
 *   • Resize each card to small (1 col) / medium (2 col) / large (full width).
 *   • Remove cards they don't care about.
 *   • Add cards back from the "Add card" menu.
 *
 * The layout state is stored on user_profiles.home_dashboard_layout and
 * follows the user across devices. The card *content* is rendered server-
 * side (so all the data fetching stays on the server), passed in as a
 * pre-rendered ReactNode keyed by card id.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Maximize2, Minus, MoreHorizontal, Plus, X } from "lucide-react";
import { setHomeDashboardLayout } from "@/lib/actions/user-prefs";
import type { HomeDashboardLayout } from "@/lib/db/queries/user-prefs";

export type DashboardCard = {
  /** Stable type key, e.g. "my_work", "new_leads". */
  type: string;
  /** Display label shown in the Add-card menu and card titlebar. */
  label: string;
  /** Default size when first added. */
  defaultSize: CardSize;
  /** Pre-rendered card body (server-rendered). */
  node: React.ReactNode;
};

export type CardSize = "small" | "medium" | "large";

const SIZE_CLASSES: Record<CardSize, string> = {
  small: "lg:col-span-1",
  medium: "lg:col-span-2",
  large: "lg:col-span-3",
};

type LayoutCard = {
  id: string; // matches card.type (each type used at most once for now)
  type: string;
  size: CardSize;
};

function defaultLayoutFor(available: DashboardCard[]): LayoutCard[] {
  return available.map((c) => ({
    id: c.type,
    type: c.type,
    size: c.defaultSize,
  }));
}

function reconcileLayout(
  available: DashboardCard[],
  saved: HomeDashboardLayout | null,
): LayoutCard[] {
  const knownTypes = new Set(available.map((c) => c.type));
  const savedCards = (saved?.cards ?? [])
    .filter((c) => knownTypes.has((c as unknown as { type?: string }).type ?? ""))
    .map((c) => {
      const raw = c as unknown as {
        id?: string;
        type?: string;
        w?: number;
        size?: CardSize;
      };
      const size: CardSize =
        raw.size ?? (raw.w && raw.w >= 3 ? "large" : raw.w === 2 ? "medium" : "small");
      const type = raw.type ?? "";
      return {
        id: raw.id ?? type,
        type,
        size,
      };
    });
  if (savedCards.length === 0) return defaultLayoutFor(available);
  return savedCards;
}

export function HomeDashboard({
  availableCards,
  initialLayout,
}: {
  availableCards: DashboardCard[];
  initialLayout: HomeDashboardLayout | null;
}) {
  const [layout, setLayout] = useState<LayoutCard[]>(() =>
    reconcileLayout(availableCards, initialLayout),
  );
  const [editing, setEditing] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const cardByType = useMemo(() => {
    const m = new Map<string, DashboardCard>();
    for (const c of availableCards) m.set(c.type, c);
    return m;
  }, [availableCards]);

  const hidden = useMemo(() => {
    const shown = new Set(layout.map((c) => c.type));
    return availableCards.filter((c) => !shown.has(c.type));
  }, [availableCards, layout]);

  /* Persist with light debounce */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((next: LayoutCard[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setHomeDashboardLayout({
        cards: next.map((c, i) => ({
          id: c.id,
          type: c.type,
          x: 0,
          y: i,
          w: c.size === "large" ? 3 : c.size === "medium" ? 2 : 1,
          h: 1,
          config: { size: c.size },
        })),
      });
    }, 400);
  }, []);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  function update(next: LayoutCard[]) {
    setLayout(next);
    persist(next);
  }

  function setSize(id: string, size: CardSize) {
    update(layout.map((c) => (c.id === id ? { ...c, size } : c)));
  }

  function removeCard(id: string) {
    update(layout.filter((c) => c.id !== id));
  }

  function addCard(type: string) {
    const def = cardByType.get(type);
    if (!def) return;
    update([
      ...layout,
      { id: type, type, size: def.defaultSize },
    ]);
    setAddMenuOpen(false);
  }

  function resetLayout() {
    update(defaultLayoutFor(availableCards));
  }

  function onDragStart(id: string) {
    setDraggingId(id);
  }
  function onDragEnd() {
    setDraggingId(null);
  }
  function onDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) return;
    const src = layout.findIndex((c) => c.id === draggingId);
    const dst = layout.findIndex((c) => c.id === targetId);
    if (src < 0 || dst < 0) return;
    const next = [...layout];
    const [moved] = next.splice(src, 1);
    next.splice(dst, 0, moved);
    update(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={
            "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border " +
            (editing
              ? "bg-tbb-navy text-tbb-cream border-tbb-navy"
              : "bg-white text-tbb-navy border-tbb-line hover:bg-tbb-cream-50")
          }
        >
          <MoreHorizontal className="w-3.5 h-3.5" aria-hidden />
          {editing ? "Done editing" : "Customize"}
        </button>
        {editing && (
          <>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAddMenuOpen((v) => !v)}
                disabled={hidden.length === 0}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-white text-tbb-navy border border-tbb-line hover:bg-tbb-cream-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden />
                Add card
              </button>
              {addMenuOpen && hidden.length > 0 && (
                <>
                  <div
                    role="presentation"
                    onClick={() => setAddMenuOpen(false)}
                    className="fixed inset-0 z-30"
                  />
                  <div className="absolute left-0 mt-1 z-40 w-64 bg-white border border-tbb-line rounded-md shadow-tbb-md p-1.5">
                    {hidden.map((c) => (
                      <button
                        key={c.type}
                        type="button"
                        onClick={() => addCard(c.type)}
                        className="w-full text-left px-2.5 py-2 rounded text-sm text-tbb-navy hover:bg-tbb-cream-50 font-bold"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={resetLayout}
              className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy px-2 py-1.5"
            >
              Reset
            </button>
            <span className="text-[11px] text-tbb-ink-3">
              Drag the grip on each card to rearrange.
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {layout.map((slot) => {
          const def = cardByType.get(slot.type);
          if (!def) return null;
          return (
            <div
              key={slot.id}
              draggable={editing}
              onDragStart={() => onDragStart(slot.id)}
              onDragEnd={onDragEnd}
              onDragOver={(e) => onDragOver(e, slot.id)}
              className={
                "relative bg-white border rounded-md shadow-tbb-sm overflow-hidden " +
                SIZE_CLASSES[slot.size] +
                " " +
                (draggingId === slot.id ? "opacity-50 " : "") +
                (editing ? "border-tbb-blue/40 ring-1 ring-tbb-blue/20" : "border-tbb-line")
              }
            >
              {editing && (
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-white border border-tbb-line rounded-pill p-0.5 shadow-tbb-sm">
                  <SizeBtn
                    active={slot.size === "small"}
                    onClick={() => setSize(slot.id, "small")}
                    label="Small"
                    icon={<Minus className="w-3 h-3" aria-hidden />}
                  />
                  <SizeBtn
                    active={slot.size === "medium"}
                    onClick={() => setSize(slot.id, "medium")}
                    label="Medium"
                    icon={<span className="text-[10px] font-bold">M</span>}
                  />
                  <SizeBtn
                    active={slot.size === "large"}
                    onClick={() => setSize(slot.id, "large")}
                    label="Large"
                    icon={<Maximize2 className="w-3 h-3" aria-hidden />}
                  />
                  <button
                    type="button"
                    onClick={() => removeCard(slot.id)}
                    aria-label={`Remove ${def.label}`}
                    title={`Remove ${def.label}`}
                    className="grid place-items-center w-6 h-6 rounded-full text-tbb-danger hover:bg-tbb-danger/10"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
              )}
              {editing && (
                <div className="absolute top-2 left-2 z-10 text-tbb-ink-4 cursor-grab active:cursor-grabbing">
                  <GripVertical className="w-4 h-4" aria-hidden />
                </div>
              )}
              <div className={editing ? "pt-10" : ""}>{def.node}</div>
            </div>
          );
        })}

        {layout.length === 0 && (
          <div className="col-span-full bg-tbb-cream-50 border border-dashed border-tbb-line rounded-md p-8 text-center text-sm text-tbb-ink-3">
            Your home is empty. Click <strong>Customize → Add card</strong> to pick what you want
            to see here.
          </div>
        )}
      </div>
    </div>
  );
}

function SizeBtn({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Set size: ${label}`}
      title={label}
      className={
        "grid place-items-center w-6 h-6 rounded-full transition-colors " +
        (active
          ? "bg-tbb-blue text-white"
          : "text-tbb-ink-3 hover:bg-tbb-cream-50")
      }
    >
      {icon}
    </button>
  );
}
