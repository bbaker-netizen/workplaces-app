"use client";

/**
 * NotificationToaster — in-app pop-up notifications for the Business Builder
 * console. Polls the same enriched feed as the sidebar bell every ~45s and
 * slides a toast in for anything unread and newer than what's already been
 * seen. Clicking a toast navigates to the item.
 *
 * "Already seen" is tracked as a timestamp in localStorage so a page reload
 * doesn't re-pop old notifications, and the first-ever load sets the
 * baseline to "now" rather than dumping a backlog.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import {
  getToastNotifications,
  type ToastNotification,
} from "@/lib/actions/notifications";

const SEEN_KEY = "tbb.toast.lastSeenMs";
const POLL_MS = 45_000;
const AUTO_DISMISS_MS = 9_000;
const MAX_VISIBLE = 4;

export function NotificationToaster() {
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const lastSeenRef = useRef<number>(0);
  const baselinedRef = useRef(false);

  const persist = useCallback((ms: number) => {
    try {
      window.localStorage.setItem(SEEN_KEY, String(ms));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let stored = 0;
    try {
      const raw = window.localStorage.getItem(SEEN_KEY);
      stored = raw ? parseInt(raw, 10) : 0;
    } catch {
      /* ignore */
    }
    lastSeenRef.current = Number.isFinite(stored) ? stored : 0;

    let cancelled = false;

    async function poll() {
      let rows: ToastNotification[];
      try {
        rows = await getToastNotifications();
      } catch {
        return;
      }
      if (cancelled) return;

      const newest = rows.reduce(
        (m, r) => Math.max(m, r.createdAtMs),
        lastSeenRef.current,
      );

      // First load with no baseline: don't blast a backlog — just record
      // where we are and wait for genuinely new arrivals.
      if (!baselinedRef.current && lastSeenRef.current === 0) {
        baselinedRef.current = true;
        lastSeenRef.current = newest;
        persist(newest);
        return;
      }
      baselinedRef.current = true;

      const fresh = rows
        .filter((r) => !r.read && r.createdAtMs > lastSeenRef.current)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);

      if (newest > lastSeenRef.current) {
        lastSeenRef.current = newest;
        persist(newest);
      }
      if (fresh.length > 0) {
        setToasts((prev) => {
          const seen = new Set(prev.map((t) => t.id));
          const add = fresh.filter((t) => !seen.has(t.id));
          return [...prev, ...add].slice(-MAX_VISIBLE);
        });
      }
    }

    poll();
    const iv = window.setInterval(poll, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [persist]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const open = useCallback(
    (t: ToastNotification) => {
      if (t.href) router.push(t.href);
      dismiss(t.id);
    },
    [router, dismiss],
  );

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none">
      {toasts.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          onDismiss={() => dismiss(t.id)}
          onOpen={() => open(t)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
  onOpen,
}: {
  toast: ToastNotification;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    // onDismiss identity is stable enough for the toast's lifetime; we only
    // want this to run once when the card mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      className={
        "pointer-events-auto flex items-start gap-3 rounded-lg border border-tbb-line bg-white shadow-tbb-lg px-4 py-3 transition-all duration-tbb-base " +
        (shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")
      }
    >
      <span className="flex-none w-8 h-8 rounded-full bg-tbb-blue-100 text-tbb-blue grid place-items-center mt-0.5">
        <Bell className="w-4 h-4" aria-hidden />
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left"
      >
        <span className="block text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Notification
        </span>
        <span className="block text-sm text-tbb-navy font-medium leading-snug">
          {toast.label}
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-none text-tbb-ink-4 hover:text-tbb-navy"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}
