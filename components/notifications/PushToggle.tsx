"use client";

/**
 * PushToggle — lets a Business Builder turn on desktop/browser push so
 * notifications reach them with the tab closed. Registers the push-only
 * service worker, asks for permission, subscribes via the browser's
 * PushManager, and stores the subscription server-side.
 */

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import {
  deletePushSubscription,
  savePushSubscription,
} from "@/lib/actions/push";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type State =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "blocked"
  | "off"
  | "on"
  | "working";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getReg(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/push-sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/push-sw.js");
}

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState("unsupported");
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        setState("unconfigured");
        return;
      }
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setState(sub ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, []);

  async function enable() {
    setError(null);
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await getReg();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          VAPID_PUBLIC_KEY as string,
        ) as BufferSource,
      });
      const json = sub.toJSON();
      const keys = json.keys ?? {};
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: keys.p256dh ?? "",
        auth: keys.auth ?? "",
        userAgent: navigator.userAgent.slice(0, 500),
      });
      if (!res.ok) {
        setError(res.error);
        setState("off");
        return;
      }
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't enable notifications.");
      setState("off");
    }
  }

  async function disable() {
    setError(null);
    setState("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn off notifications.");
      setState("on");
    }
  }

  const shell =
    "border border-tbb-line rounded-lg bg-white shadow-tbb-sm p-5 space-y-2";

  if (state === "loading") {
    return (
      <div className={shell}>
        <p className="text-sm text-tbb-ink-3 inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Checking
          desktop notifications…
        </p>
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div className={shell}>
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Desktop notifications
        </h2>
        <p className="text-sm text-tbb-ink-2">
          This browser doesn&apos;t support push notifications. Try Chrome,
          Edge, or Firefox on desktop.
        </p>
      </div>
    );
  }

  if (state === "unconfigured") {
    return (
      <div className={shell}>
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Desktop notifications
        </h2>
        <p className="text-sm text-tbb-ink-2">
          Desktop push isn&apos;t configured on the server yet (the VAPID keys
          need to be set in Netlify). Once they are, this turns on.
        </p>
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className={shell}>
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Desktop notifications
        </h2>
        <p className="text-sm text-tbb-ink-2">
          Notifications are blocked for this site in your browser. Allow them
          in your browser&apos;s site settings, then reload this page.
        </p>
      </div>
    );
  }

  const on = state === "on";
  const working = state === "working";
  return (
    <div className={shell}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Desktop notifications
          </h2>
          <p className="text-sm text-tbb-ink-2 mt-1">
            {on
              ? "On — you'll get a desktop pop-up for new leads, comments, and other alerts even when this tab is closed."
              : "Get a desktop pop-up for new leads, comments, and other alerts even when The Builder isn't open."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={on ? disable : enable}
        disabled={working}
        className={
          "inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill disabled:opacity-50 " +
          (on
            ? "bg-white border border-tbb-line text-tbb-navy hover:border-tbb-danger hover:text-tbb-danger"
            : "bg-tbb-blue text-white hover:bg-tbb-blue-700")
        }
      >
        {working ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : on ? (
          <BellOff className="w-3.5 h-3.5" aria-hidden />
        ) : (
          <Bell className="w-3.5 h-3.5" aria-hidden />
        )}
        {on ? "Turn off desktop alerts" : "Enable desktop alerts"}
      </button>
      {error && <p className="text-sm text-tbb-danger">{error}</p>}
    </div>
  );
}
