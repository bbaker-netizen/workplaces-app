"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createBooking } from "@/lib/actions/scheduling";

type Slot = { startsAt: string; startsAtLocal: string };

export function BookingForm({
  slug,
  slots,
}: {
  slug: string;
  slots: Slot[];
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (slots.length === 0) {
    return (
      <div className="border border-[#CCCCCC] rounded-md bg-white p-6">
        <p className="font-sans text-sm text-muted-foreground italic">
          No times available in the next three weeks. Try again later or reach out to{" "}
          <a
            href="mailto:notifications@4workplaces.com"
            className="text-[#2E4057] underline underline-offset-4"
          >
            notifications@4workplaces.com
          </a>
          .
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="border border-[#2E4057] rounded-md bg-[#F5F1E8] p-6 text-center space-y-3">
        <CheckCircle2 className="w-10 h-10 mx-auto text-[#2E4057]" aria-hidden />
        <p className="font-display font-bold text-foreground text-2xl tracking-tight">
          Booked.
        </p>
        <p className="font-sans text-sm text-foreground">
          We&apos;ve got you down for {success}. Look for a confirmation in your inbox.
        </p>
      </div>
    );
  }

  const submit = () => {
    if (!picked) {
      setError("Pick a time first.");
      return;
    }
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createBooking({
        slug,
        startsAtUtc: picked,
        bookerName: name.trim(),
        bookerEmail: email.trim(),
        bookerCompany: company.trim() || null,
        notes: notes.trim() || null,
      });
      if (!result.ok) setError(result.error);
      else {
        const slot = slots.find((s) => s.startsAt === picked);
        setSuccess(slot?.startsAtLocal ?? "your selected time");
      }
    });
  };

  // Group slots by day for a more readable picker.
  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const day = s.startsAtLocal.split(",")[0];
    let arr = byDay.get(day);
    if (!arr) {
      arr = [];
      byDay.set(day, arr);
    }
    arr.push(s);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-6"
      aria-busy={isPending}
    >
      <fieldset className="space-y-3">
        <legend className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Pick a time
        </legend>
        <div className="space-y-3 max-h-[24rem] overflow-y-auto border border-[#CCCCCC] rounded-md bg-white p-3">
          {Array.from(byDay.entries()).map(([day, daySlots]) => (
            <div key={day} className="space-y-1.5">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {day}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {daySlots.map((s) => (
                  <button
                    key={s.startsAt}
                    type="button"
                    onClick={() => setPicked(s.startsAt)}
                    disabled={isPending}
                    className={
                      "font-sans text-xs font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-md border transition-colors " +
                      (picked === s.startsAt
                        ? "bg-[#1A1A1A] text-[#F5F1E8] border-[#1A1A1A]"
                        : "bg-white text-foreground border-[#CCCCCC] hover:bg-[#F5F1E8] hover:border-[#666666]")
                    }
                  >
                    {s.startsAtLocal.split(",")[1]?.trim() ?? s.startsAtLocal}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Your name
          </span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Email
          </span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Company
          </span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
          />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Anything we should know? (optional)
          </span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057] resize-y"
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !picked}
        className="w-full inline-flex items-center justify-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-3 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50"
      >
        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {isPending ? "Booking…" : "Confirm booking"}
      </button>
    </form>
  );
}
