"use client";

/**
 * Pipeline table — the CRM list view.
 *
 * Tabular layout with the columns a Business Builder needs at a
 * glance: company, contact, email + phone, stage, expected value,
 * next action, owner, last contact, created. Each row is a single
 * link to the prospect detail page (the entire row is clickable);
 * the inline status select is the one click target that doesn't
 * navigate.
 *
 * Header includes filter chips (by stage) and a search box. Client-
 * side filtering keeps the page snappy for hundreds of prospects.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { ProspectStatusSelect } from "./ProspectStatusSelect";
import {
  STAGE_STYLES,
  type ProspectStatus,
} from "@/lib/pipeline/stages";
import type { PipelineProspect } from "@/lib/db/queries/prospects";

export function ProspectTable({
  prospects,
}: {
  prospects: PipelineProspect[];
}) {
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<ProspectStatus | "all">("all");

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
        (p.leadSource ?? "").toLowerCase().includes(q)
      );
    });
  }, [prospects, query, stageFilter]);

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
        <span className="text-xs text-tbb-ink-3 tabular-nums">
          {filtered.length} of {prospects.length}
        </span>
      </div>

      <div className="border border-tbb-line rounded-lg bg-white overflow-hidden shadow-tbb-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-tbb-bg-soft border-b border-tbb-line-soft">
              <tr className="text-left">
                <Th>Company</Th>
                <Th>Contact</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Stage</Th>
                <Th alignRight>Value</Th>
                <Th>Next action</Th>
                <Th>Owner</Th>
                <Th>Last contact</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <ProspectRow key={p.id} prospect={p} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
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

function Th({
  children,
  alignRight,
}: {
  children: React.ReactNode;
  alignRight?: boolean;
}) {
  return (
    <th
      className={
        "px-4 py-2.5 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 " +
        (alignRight ? "text-right" : "")
      }
    >
      {children}
    </th>
  );
}

function ProspectRow({ prospect }: { prospect: PipelineProspect }) {
  const href = `/coach/pipeline/${prospect.id}`;
  return (
    <tr className="border-b border-tbb-line-soft last:border-b-0 hover:bg-tbb-cream-50 transition-colors duration-tbb-base">
      <Td>
        <Link
          href={href}
          className="block font-bold text-tbb-navy hover:underline underline-offset-4"
        >
          {prospect.companyName}
        </Link>
      </Td>
      <Td>
        <Link
          href={href}
          className="block text-tbb-ink-2 hover:text-tbb-navy"
        >
          {prospect.contactName || (
            <span className="text-tbb-ink-4">—</span>
          )}
        </Link>
      </Td>
      <Td>
        <a
          href={`mailto:${prospect.contactEmail}`}
          className="text-tbb-blue hover:underline underline-offset-4 break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {prospect.contactEmail}
        </a>
      </Td>
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
          <span className="text-tbb-ink-4">—</span>
        )}
      </Td>
      <Td>
        <ProspectStatusSelect
          prospectId={prospect.id}
          current={prospect.status as ProspectStatus}
        />
      </Td>
      <Td alignRight>
        {prospect.expectedValueCents ? (
          <span className="tabular-nums font-bold text-tbb-navy whitespace-nowrap">
            ${(prospect.expectedValueCents / 100).toLocaleString("en-CA", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </span>
        ) : (
          <span className="text-tbb-ink-4">—</span>
        )}
      </Td>
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
              <span className="block text-[11px] text-tbb-ink-3 truncate max-w-[14ch]">
                {prospect.nextActionNote}
              </span>
            )}
          </Link>
        ) : (
          <span className="text-tbb-ink-4">—</span>
        )}
      </Td>
      <Td>
        <span className="text-tbb-ink-2 whitespace-nowrap">
          {prospect.ownerName || (
            <span className="text-tbb-ink-4">Unassigned</span>
          )}
        </span>
      </Td>
      <Td>
        {prospect.lastContactAt ? (
          <span className="text-tbb-ink-2 whitespace-nowrap">
            {new Date(prospect.lastContactAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        ) : (
          <span className="text-tbb-ink-4">—</span>
        )}
      </Td>
      <Td>
        <span className="text-tbb-ink-3 whitespace-nowrap tabular-nums">
          {prospect.createdAt.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </Td>
    </tr>
  );
}

function Td({
  children,
  alignRight,
}: {
  children: React.ReactNode;
  alignRight?: boolean;
}) {
  return (
    <td className={"px-4 py-3 align-top " + (alignRight ? "text-right" : "")}>
      {children}
    </td>
  );
}
