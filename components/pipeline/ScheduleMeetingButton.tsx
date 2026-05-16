"use client";

/**
 * Inline action: schedule a meeting with the prospect and send them a
 * real Google Calendar invite. For video meetings, generates a fresh
 * Google Meet link automatically.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Loader2,
  MapPin,
  Phone,
  Video,
  X,
} from "lucide-react";
import { scheduleProspectMeeting } from "@/lib/actions/schedule-prospect-meeting";

type MeetingType = "video" | "in_person" | "phone";

export function ScheduleMeetingButton({
  prospectId,
  companyName,
  recipientName,
}: {
  prospectId: string;
  companyName: string;
  recipientName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(`Workplaces ↔ ${companyName}`);
  const [startAt, setStartAt] = useState(defaultStart());
  const [duration, setDuration] = useState<number>(30);
  const [meetingType, setMeetingType] = useState<MeetingType>("video");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<
    | { hangoutLink: string | null; htmlLink: string | null }
    | null
  >(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await scheduleProspectMeeting({
        prospectId,
        title,
        startAt: new Date(startAt).toISOString(),
        durationMinutes: duration,
        meetingType,
        location: location.trim() || null,
        description: description.trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(r.data);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setSuccess(null);
            setError(null);
          }}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta transition-transform duration-tbb-fast hover:scale-[1.02]"
        >
          <Calendar className="w-3.5 h-3.5" aria-hidden />
          {open ? "Close" : "Schedule Meeting"}
        </button>
        {success && (
          <span className="text-[11px] text-tbb-success font-bold">
            ✓ Invite sent
            {success.hangoutLink && (
              <>
                {" — "}
                <a
                  href={success.hangoutLink}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline"
                >
                  Open Meet link
                </a>
              </>
            )}
          </span>
        )}
      </div>

      {open && (
        <div className="border border-tbb-line rounded-lg bg-tbb-cream-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Inviting {recipientName ? `${recipientName} at ${companyName}` : companyName}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-tbb-ink-3 hover:text-tbb-navy"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Title
              </span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isPending}
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                When
              </span>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                disabled={isPending}
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Duration
              </span>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                disabled={isPending}
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
                <option value={120}>2 hours</option>
              </select>
            </label>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Meeting type
            </span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <MeetingTypeOption
                active={meetingType === "video"}
                onClick={() => setMeetingType("video")}
                icon={<Video className="w-3.5 h-3.5" aria-hidden />}
                label="Video"
                hint="Auto-creates Google Meet link"
              />
              <MeetingTypeOption
                active={meetingType === "in_person"}
                onClick={() => setMeetingType("in_person")}
                icon={<MapPin className="w-3.5 h-3.5" aria-hidden />}
                label="In person"
                hint="Add address below"
              />
              <MeetingTypeOption
                active={meetingType === "phone"}
                onClick={() => setMeetingType("phone")}
                icon={<Phone className="w-3.5 h-3.5" aria-hidden />}
                label="Phone"
                hint="Add number below"
              />
            </div>
          </div>

          {meetingType !== "video" && (
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                {meetingType === "in_person" ? "Address" : "Phone number"}
              </span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={isPending}
                placeholder={
                  meetingType === "in_person"
                    ? "123 Main Street, Edmonton"
                    : "+1 780 555 1234"
                }
                className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
            </label>
          )}

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Agenda / notes (optional)
            </span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              placeholder="What you'll cover — appears in the calendar invite description."
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
            />
          </label>

          {error && (
            <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-white">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={isPending || !title.trim() || !startAt}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
            >
              {isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              )}
              Send invite
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingTypeOption({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={
        "flex flex-col items-center gap-1 py-2 px-2 rounded-md border transition-colors duration-tbb-fast " +
        (active
          ? "bg-tbb-blue text-white border-tbb-blue"
          : "bg-white text-tbb-navy border-tbb-line hover:bg-tbb-cream-50")
      }
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-tbb-caps">
        {label}
      </span>
    </button>
  );
}

/** Default to next round-half-hour at least 1 hour in the future. */
function defaultStart(): string {
  const now = new Date(Date.now() + 60 * 60_000);
  // Round up to the next :00 or :30
  const min = now.getMinutes();
  now.setMinutes(min < 30 ? 30 : 0, 0, 0);
  if (min >= 30) now.setHours(now.getHours() + 1);
  // datetime-local format YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
