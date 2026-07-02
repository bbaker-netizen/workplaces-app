"use client";

/**
 * Client quick-search on the console home. Type a client's name and jump
 * straight to their workspace — a fast "open my application, find a client"
 * entry point. Keyboard: ↑/↓ to move, Enter to open, Esc to clear.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type Client = { id: string; name: string };

export function ClientQuickSearch({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return clients
      .filter((c) => c.name.toLowerCase().includes(t))
      .slice(0, 8);
  }, [q, clients]);

  function open_(id: string) {
    router.push(`/business-builder/engagements/${id}`);
  }

  const showDrop = open && q.trim().length > 0;

  return (
    <div className="relative app-rise">
      <div className="flex items-center gap-2 rounded-pill border border-tbb-line bg-white px-4 py-2.5 focus-within:ring-2 focus-within:ring-tbb-blue max-w-xl">
        <Search className="w-4 h-4 text-tbb-ink-3 shrink-0" aria-hidden />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              open_(results[active].id);
            } else if (e.key === "Escape") {
              setQ("");
              setOpen(false);
            }
          }}
          placeholder="Search clients…"
          aria-label="Search clients"
          className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-tbb-ink-3 focus:outline-none"
        />
        {q && (
          <span className="text-[11px] font-mono text-tbb-ink-3 shrink-0">
            {results.length}
          </span>
        )}
      </div>

      {showDrop && (
        <ul className="absolute z-30 mt-1.5 w-full max-w-xl rounded-lg border border-tbb-line bg-white shadow-tbb-lg overflow-hidden">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-tbb-ink-3">
              No clients match &ldquo;{q.trim()}&rdquo;.
            </li>
          ) : (
            results.map((c, i) => (
              <li key={c.id}>
                <Link
                  href={`/business-builder/engagements/${c.id}`}
                  onMouseEnter={() => setActive(i)}
                  className={
                    "block px-4 py-2.5 text-sm text-foreground " +
                    (i === active ? "bg-tbb-bg-soft" : "hover:bg-tbb-bg-soft")
                  }
                >
                  {c.name}
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
