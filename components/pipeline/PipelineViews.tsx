"use client";

/**
 * Table / Board view switch for the Pipeline. Remembers the chosen view in
 * localStorage. Table = the existing sortable grid; Board = the Kanban.
 */

import { useEffect, useState } from "react";
import { LayoutGrid, Table2 } from "lucide-react";
import { ProspectTable } from "./ProspectTable";
import { ProspectBoard } from "./ProspectBoard";
import type { PipelineProspect } from "@/lib/db/queries/prospects";
import type { PipelineColumnPrefs } from "@/lib/db/queries/user-prefs";

const VIEW_KEY = "tbb_pipeline_view";
type View = "table" | "board";

export function PipelineViews({
  prospects,
  initialPrefs,
}: {
  prospects: PipelineProspect[];
  initialPrefs: PipelineColumnPrefs | null;
}) {
  const [view, setView] = useState<View>("table");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "board" || saved === "table") setView(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function choose(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 rounded-pill border border-tbb-line bg-white p-0.5">
        <ViewButton
          active={view === "table"}
          onClick={() => choose("table")}
          icon={<Table2 className="w-3.5 h-3.5" aria-hidden />}
          label="Table"
        />
        <ViewButton
          active={view === "board"}
          onClick={() => choose("board")}
          icon={<LayoutGrid className="w-3.5 h-3.5" aria-hidden />}
          label="Board"
        />
      </div>

      {view === "table" ? (
        <ProspectTable prospects={prospects} initialPrefs={initialPrefs} />
      ) : (
        <ProspectBoard prospects={prospects} />
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-bold uppercase tracking-tbb-caps transition-colors " +
        (active
          ? "bg-tbb-blue text-white"
          : "text-tbb-ink-3 hover:text-tbb-navy")
      }
    >
      {icon}
      {label}
    </button>
  );
}
