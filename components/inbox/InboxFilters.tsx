"use client";

/**
 * InboxFilters — search box, channel/direction selects, tag chips.
 *
 * All filters live in the URL search params so links + browser
 * navigation reload them cleanly. Submit on input change uses a
 * small debounce to keep the URL from thrashing while typing.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

const CHANNELS = [
  { value: "all", label: "All channels" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone_call", label: "Phone calls" },
  { value: "meeting_note", label: "Meeting notes" },
  { value: "other", label: "Other" },
];

const DIRECTIONS = [
  { value: "all", label: "Inbound & outbound" },
  { value: "inbound", label: "Inbound only" },
  { value: "outbound", label: "Outbound only" },
];

export function InboxFilters({
  knownTags,
  currentFilters,
}: {
  knownTags: string[];
  currentFilters: {
    q?: string;
    channel?: string | null;
    direction?: string | null;
    tag?: string | null;
  };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(currentFilters.q ?? "");

  // Debounced URL push when q changes.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (q) params.set("q", q);
      else params.delete("q");
      router.push(`/business-builder/inbox?${params.toString()}`);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value && value !== "all" && value.length > 0) params.set(key, value);
    else params.delete(key);
    router.push(`/business-builder/inbox?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="relative flex-1 min-w-[260px] max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tbb-ink-3"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subject, body, sender…"
            className="w-full bg-white border border-tbb-line rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </label>
        <select
          value={currentFilters.channel ?? "all"}
          onChange={(e) => setParam("channel", e.target.value)}
          className="bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={currentFilters.direction ?? "all"}
          onChange={(e) => setParam("direction", e.target.value)}
          className="bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        >
          {DIRECTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      {knownTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Tags
          </span>
          <button
            type="button"
            onClick={() => setParam("tag", "")}
            className={
              "px-2.5 py-1 rounded-pill text-[11px] font-bold uppercase tracking-tbb-caps border " +
              (!currentFilters.tag
                ? "bg-tbb-navy text-tbb-cream border-tbb-navy"
                : "bg-white text-tbb-ink-3 border-tbb-line hover:bg-tbb-cream-50")
            }
          >
            All
          </button>
          {knownTags.map((t) => {
            const active = currentFilters.tag === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setParam("tag", t)}
                className={
                  "px-2.5 py-1 rounded-pill text-[11px] font-bold uppercase tracking-tbb-caps border " +
                  (active
                    ? "bg-tbb-blue text-white border-tbb-blue"
                    : "bg-white text-tbb-ink-3 border-tbb-line hover:bg-tbb-cream-50")
                }
              >
                {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
