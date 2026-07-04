"use client";

/**
 * Location field with Google Places address autocomplete. Typing (3+ chars,
 * debounced) fetches suggestions via the server action; picking one fills
 * the field. If Places isn't configured, it's just a plain text box —
 * you can always type a freeform location (an office, a coffee shop, a
 * video link).
 */

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { suggestAddresses } from "@/lib/actions/address-lookup";

export function LocationInput({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Skip the lookup right after a pick or an external set.
  const skipNext = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await suggestAddresses(q);
      if (cancelled) return;
      setLoading(false);
      if (r.ok && r.configured && r.suggestions.length > 0) {
        setSuggestions(r.suggestions);
        setOpen(true);
      } else {
        setSuggestions([]);
        setOpen(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(s: string) {
    skipNext.current = true;
    onChange(s);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {loading && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-tbb-caps text-tbb-ink-4">
          …
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md border border-tbb-line bg-white shadow-tbb-md">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-tbb-navy hover:bg-tbb-bg-soft"
              >
                <MapPin
                  className="w-3.5 h-3.5 text-tbb-ink-3 shrink-0 mt-0.5"
                  aria-hidden
                />
                <span>{s}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
