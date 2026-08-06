"use client";

/**
 * Booking links — the console side of /book/<slug>.
 *
 * The table, the public page and the prospect a booking creates have all
 * existed since Phase 3.8; the only thing missing was somewhere to make
 * a link. Everything here is a thin cover over the server actions, which
 * hold the real rules (slug uniqueness, who may own a link, whether the
 * availability window can ever produce a slot).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  createSchedulingLink,
  deleteSchedulingLink,
  updateSchedulingLink,
} from "@/lib/actions/scheduling";
import type { SchedulingLinkRow } from "@/lib/db/queries/scheduling-links";

/** ISO weekday numbers, which is what Luxon's `weekday` returns and what
 *  the availability JSON stores. Monday first — the working week. */
const WEEKDAYS: ReadonlyArray<{ n: number; label: string; short: string }> = [
  { n: 1, label: "Monday", short: "Mon" },
  { n: 2, label: "Tuesday", short: "Tue" },
  { n: 3, label: "Wednesday", short: "Wed" },
  { n: 4, label: "Thursday", short: "Thu" },
  { n: 5, label: "Friday", short: "Fri" },
  { n: 6, label: "Saturday", short: "Sat" },
  { n: 7, label: "Sunday", short: "Sun" },
];

const MEETING_TYPES: ReadonlyArray<{
  value: "discovery" | "bbs" | "ad_hoc";
  label: string;
  hint: string;
}> = [
  {
    value: "discovery",
    label: "Discovery call",
    hint: "Creates a lead in the pipeline, owned by whoever the link belongs to. These are the links listed on the public /book page.",
  },
  {
    value: "bbs",
    label: "Business Building session",
    hint: "Shared in context with an existing client. Never appears on the public booking page.",
  },
  {
    value: "ad_hoc",
    label: "One-off meeting",
    hint: "Sent to one person for one conversation. No lead is created.",
  },
];

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function timeToMinutes(v: string): number {
  const [h, m] = v.split(":").map((n) => Number.parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function prettyTime(m: number): string {
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

function slugify(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

type Builder = { id: string; fullName: string };

type Draft = {
  slug: string;
  name: string;
  description: string;
  meetingType: "discovery" | "bbs" | "ad_hoc";
  durationMinutes: number;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  isActive: boolean;
  coachUserProfileId: string;
};

function blankDraft(ownerId: string): Draft {
  return {
    slug: "",
    name: "",
    description: "",
    meetingType: "discovery",
    durationMinutes: 30,
    weekdays: [1, 2, 3, 4, 5],
    startMinute: 510,
    endMinute: 1080,
    isActive: true,
    coachUserProfileId: ownerId,
  };
}

function draftFrom(link: SchedulingLinkRow): Draft {
  return {
    slug: link.slug,
    name: link.name,
    description: link.description ?? "",
    meetingType: link.meetingType,
    durationMinutes: link.durationMinutes,
    weekdays: link.weekdays,
    startMinute: link.startMinute,
    endMinute: link.endMinute,
    isActive: link.isActive,
    coachUserProfileId: link.coachUserProfileId,
  };
}

const inputClass =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";
const labelClass =
  "block font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3 mb-1";

/* ------------------------------- the form ------------------------------- */

function LinkForm({
  draft,
  setDraft,
  builders,
  canAssign,
  baseUrl,
  slugLocked,
  onSave,
  onCancel,
  saving,
  error,
  saveLabel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  builders: Builder[];
  canAssign: boolean;
  baseUrl: string;
  /** True while editing: the slug is a live URL somebody may hold. */
  slugLocked: boolean;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  saveLabel: string;
}) {
  const [slugTouched, setSlugTouched] = useState(slugLocked);
  const typeHint = MEETING_TYPES.find((t) => t.value === draft.meetingType)?.hint;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="link-name">
            Name
          </label>
          <input
            id="link-name"
            className={inputClass}
            value={draft.name}
            placeholder="Discovery call"
            disabled={saving}
            onChange={(e) => {
              const name = e.target.value;
              setDraft({
                ...draft,
                name,
                slug: slugTouched ? draft.slug : slugify(name),
              });
            }}
          />
          <p className="mt-1 font-sans text-xs text-tbb-ink-3">
            What the prospect sees at the top of the booking page.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="link-slug">
            Web address
          </label>
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-tbb-ink-3 shrink-0">
              /book/
            </span>
            <input
              id="link-slug"
              className={inputClass}
              value={draft.slug}
              placeholder="bruce-discovery"
              disabled={saving}
              onChange={(e) => {
                setSlugTouched(true);
                setDraft({ ...draft, slug: slugify(e.target.value) });
              }}
            />
          </div>
          <p className="mt-1 font-sans text-xs text-tbb-ink-3">
            {slugLocked
              ? "Changing this breaks any copy of the old address already sent out."
              : "Lowercase letters, numbers and hyphens. Has to be unique across the practice."}
          </p>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="link-desc">
          Description <span className="normal-case">(optional)</span>
        </label>
        <textarea
          id="link-desc"
          className={inputClass}
          rows={2}
          value={draft.description}
          placeholder="A first conversation about your business — no pitch, no pressure."
          disabled={saving}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="link-type">
            Meeting type
          </label>
          <select
            id="link-type"
            className={inputClass}
            value={draft.meetingType}
            disabled={saving}
            onChange={(e) =>
              setDraft({
                ...draft,
                meetingType: e.target.value as Draft["meetingType"],
              })
            }
          >
            {MEETING_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {typeHint && (
            <p className="mt-1 font-sans text-xs text-tbb-ink-3">{typeHint}</p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="link-duration">
            Length
          </label>
          <select
            id="link-duration"
            className={inputClass}
            value={draft.durationMinutes}
            disabled={saving}
            onChange={(e) =>
              setDraft({
                ...draft,
                durationMinutes: Number.parseInt(e.target.value, 10),
              })
            }
          >
            {[15, 20, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
          <p className="mt-1 font-sans text-xs text-tbb-ink-3">
            Slots are offered back to back for the whole window.
          </p>
        </div>
      </div>

      {canAssign && builders.length > 1 && (
        <div>
          <label className={labelClass} htmlFor="link-coach">
            Business Builder
          </label>
          <select
            id="link-coach"
            className={inputClass}
            value={draft.coachUserProfileId}
            disabled={saving}
            onChange={(e) =>
              setDraft({ ...draft, coachUserProfileId: e.target.value })
            }
          >
            {builders.map((b) => (
              <option key={b.id} value={b.id}>
                {b.fullName}
              </option>
            ))}
          </select>
          <p className="mt-1 font-sans text-xs text-tbb-ink-3">
            Whose calendar this books, and who owns any lead that comes
            through it.
          </p>
        </div>
      )}

      <fieldset>
        <legend className={labelClass}>Days you take these</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => {
            const on = draft.weekdays.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                disabled={saving}
                aria-pressed={on}
                onClick={() =>
                  setDraft({
                    ...draft,
                    weekdays: on
                      ? draft.weekdays.filter((n) => n !== d.n)
                      : [...draft.weekdays, d.n].sort((a, b) => a - b),
                  })
                }
                className={
                  "px-3 py-1.5 rounded-pill text-xs font-bold uppercase tracking-tbb-caps border transition-colors " +
                  (on
                    ? "bg-tbb-blue text-white border-tbb-blue"
                    : "bg-white text-tbb-ink-3 border-tbb-line hover:border-tbb-blue")
                }
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="link-start">
            Earliest start
          </label>
          <input
            id="link-start"
            type="time"
            className={inputClass}
            value={minutesToTime(draft.startMinute)}
            disabled={saving}
            onChange={(e) =>
              setDraft({ ...draft, startMinute: timeToMinutes(e.target.value) })
            }
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="link-end">
            Latest finish
          </label>
          <input
            id="link-end"
            type="time"
            className={inputClass}
            value={minutesToTime(draft.endMinute)}
            disabled={saving}
            onChange={(e) =>
              setDraft({ ...draft, endMinute: timeToMinutes(e.target.value) })
            }
          />
        </div>
      </div>
      <p className="font-sans text-xs text-tbb-ink-3">
        Mountain Time. Booked slots are excluded automatically; the rest of
        your calendar is not, so keep the window to hours you can genuinely
        take a call.
      </p>

      <label className="flex items-center gap-2 font-sans text-sm text-tbb-ink-2">
        <input
          type="checkbox"
          checked={draft.isActive}
          disabled={saving}
          onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
        />
        Accepting bookings
      </label>

      {draft.slug && (
        <p className="font-mono text-xs text-tbb-ink-3 break-all">
          {baseUrl}/book/{draft.slug}
        </p>
      )}

      {error && (
        <p className="font-sans text-sm text-tbb-orange-700 bg-tbb-cream-50 border border-tbb-cream-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="w-3.5 h-3.5" aria-hidden />
          )}
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill border border-tbb-line text-tbb-ink-2 hover:border-tbb-blue disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" aria-hidden />
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ the manager ------------------------------ */

export function SchedulingLinksManager({
  links,
  builders,
  currentUserProfileId,
  canAssign,
  baseUrl,
  scope,
}: {
  links: SchedulingLinkRow[];
  builders: Builder[];
  currentUserProfileId: string;
  canAssign: boolean;
  baseUrl: string;
  scope: "mine" | "practice";
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() =>
    blankDraft(currentUserProfileId),
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const byBuilder = useMemo(() => {
    const map = new Map<string, SchedulingLinkRow[]>();
    for (const l of links) {
      const list = map.get(l.coachUserProfileId);
      if (list) list.push(l);
      else map.set(l.coachUserProfileId, [l]);
    }
    return Array.from(map.entries());
  }, [links]);

  function openCreate() {
    setError(null);
    setEditingId(null);
    setDraft(blankDraft(currentUserProfileId));
    setCreating(true);
  }

  function openEdit(link: SchedulingLinkRow) {
    setError(null);
    setCreating(false);
    setDraft(draftFrom(link));
    setEditingId(link.id);
  }

  function close() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  function save() {
    setError(null);
    start(async () => {
      const payload = {
        slug: draft.slug,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        meetingType: draft.meetingType,
        durationMinutes: draft.durationMinutes,
        weekdays: draft.weekdays,
        startMinute: draft.startMinute,
        endMinute: draft.endMinute,
        isActive: draft.isActive,
        coachUserProfileId: draft.coachUserProfileId,
      };
      const r = editingId
        ? await updateSchedulingLink({ ...payload, id: editingId })
        : await createSchedulingLink(payload);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  function toggleActive(link: SchedulingLinkRow) {
    setError(null);
    start(async () => {
      const r = await updateSchedulingLink({
        id: link.id,
        isActive: !link.isActive,
      });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function remove(link: SchedulingLinkRow) {
    if (
      !window.confirm(
        `Delete "${link.name}"? Anyone holding ${baseUrl}/book/${link.slug} will get a dead page.`,
      )
    )
      return;
    setError(null);
    start(async () => {
      const r = await deleteSchedulingLink(link.id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  async function copy(slug: string) {
    const url = `${baseUrl}/book/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(slug);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be refused (insecure context, permissions).
      // The URL is on screen either way, so this is not worth an alert.
      setError(`Couldn't copy. The address is ${url}`);
    }
  }

  return (
    <div className="space-y-6">
      {error && !creating && !editingId && (
        <p className="font-sans text-sm text-tbb-orange-700 bg-tbb-cream-50 border border-tbb-cream-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {!creating && !editingId && (
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden />
          New booking link
        </button>
      )}

      {creating && (
        <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-4 shadow-tbb-sm">
          <h2 className="font-bold text-tbb-navy text-lg tracking-tight">
            New booking link
          </h2>
          <LinkForm
            draft={draft}
            setDraft={setDraft}
            builders={builders}
            canAssign={canAssign}
            baseUrl={baseUrl}
            slugLocked={false}
            onSave={save}
            onCancel={close}
            saving={saving}
            error={error}
            saveLabel="Create link"
          />
        </section>
      )}

      {links.length === 0 && !creating ? (
        <p className="font-sans text-sm text-tbb-ink-2 border border-tbb-line rounded-lg bg-white p-5">
          No booking links yet. Make one and its address goes straight onto
          the public booking page at{" "}
          <span className="font-mono text-xs">{baseUrl}/book</span>.
        </p>
      ) : (
        byBuilder.map(([builderId, rows]) => (
          <section key={builderId} className="space-y-3">
            {scope === "practice" && (
              <h2 className="font-bold text-tbb-navy text-lg tracking-tight">
                {rows[0].coachName}
              </h2>
            )}
            <ul className="space-y-3">
              {rows.map((link) => (
                <li
                  key={link.id}
                  className={
                    "border rounded-lg bg-white p-5 space-y-3 " +
                    (link.isActive
                      ? "border-tbb-line shadow-tbb-sm"
                      : "border-tbb-line-soft opacity-70")
                  }
                >
                  {editingId === link.id ? (
                    <>
                      <h3 className="font-bold text-tbb-navy text-lg tracking-tight">
                        Edit {link.name}
                      </h3>
                      <LinkForm
                        draft={draft}
                        setDraft={setDraft}
                        builders={builders}
                        canAssign={canAssign}
                        baseUrl={baseUrl}
                        slugLocked
                        onSave={save}
                        onCancel={close}
                        saving={saving}
                        error={error}
                        saveLabel="Save changes"
                      />
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 space-y-1">
                          <h3 className="font-bold text-tbb-navy text-lg tracking-tight">
                            {link.name}
                          </h3>
                          <p className="font-mono text-xs text-tbb-ink-3 break-all">
                            {baseUrl}/book/{link.slug}
                          </p>
                        </div>
                        <span
                          className={
                            "ml-auto shrink-0 text-[9px] font-bold uppercase tracking-tbb-caps px-2 py-0.5 rounded-pill border " +
                            (link.isActive
                              ? "text-tbb-blue border-tbb-blue bg-tbb-blue-50"
                              : "text-tbb-ink-3 border-tbb-line bg-tbb-cream-50")
                          }
                        >
                          {link.isActive ? "Live" : "Off"}
                        </span>
                      </div>

                      {link.description && (
                        <p className="font-sans text-sm text-tbb-ink-2">
                          {link.description}
                        </p>
                      )}

                      <p className="font-sans text-xs text-tbb-ink-3">
                        {MEETING_TYPES.find((t) => t.value === link.meetingType)
                          ?.label ?? link.meetingType}{" "}
                        · {link.durationMinutes} min ·{" "}
                        {link.weekdays.length === 0
                          ? "No days set"
                          : WEEKDAYS.filter((d) =>
                              link.weekdays.includes(d.n),
                            )
                              .map((d) => d.short)
                              .join(" ")}{" "}
                        · {prettyTime(link.startMinute)}–
                        {prettyTime(link.endMinute)} MT
                        {link.bookingCount > 0 && (
                          <>
                            {" "}
                            · {link.bookingCount} booked
                            {link.upcomingCount > 0 &&
                              ` (${link.upcomingCount} upcoming)`}
                          </>
                        )}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => copy(link.slug)}
                          className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-ink-2 hover:border-tbb-blue"
                        >
                          {copied === link.slug ? (
                            <Check className="w-3.5 h-3.5" aria-hidden />
                          ) : (
                            <Copy className="w-3.5 h-3.5" aria-hidden />
                          )}
                          {copied === link.slug ? "Copied" : "Copy address"}
                        </button>
                        <a
                          href={`/book/${link.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-ink-2 hover:border-tbb-blue"
                        >
                          <Link2 className="w-3.5 h-3.5" aria-hidden />
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => openEdit(link)}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-ink-2 hover:border-tbb-blue disabled:opacity-50"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(link)}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-ink-2 hover:border-tbb-blue disabled:opacity-50"
                        >
                          {link.isActive ? "Turn off" : "Turn on"}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(link)}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-ink-3 hover:border-tbb-orange-700 hover:text-tbb-orange-700 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
