"use client";

/**
 * useEngagementStream — subscribe a client component to the SSE
 * channel for a specific engagement. Calls `onEvent` when something
 * arrives. Caller decides what to do — typically `router.refresh()`
 * to re-fetch server data.
 */

import { useEffect } from "react";

export type EngagementStreamEvent = {
  type: string;
  data: unknown;
};

export function useEngagementStream(
  engagementId: string | null | undefined,
  onEvent: (event: EngagementStreamEvent) => void,
): void {
  useEffect(() => {
    if (!engagementId) return;
    const url = `/api/realtime/engagement/${engagementId}`;
    const source = new EventSource(url);

    const handleEvent = (eventName: string) => (e: MessageEvent) => {
      try {
        onEvent({ type: eventName, data: JSON.parse(e.data) });
      } catch {
        onEvent({ type: eventName, data: e.data });
      }
    };

    source.addEventListener("ready", handleEvent("ready"));
    source.addEventListener("message", handleEvent("message"));
    source.addEventListener("action_item", handleEvent("action_item"));

    source.onerror = () => {
      // Don't tear down — EventSource auto-reconnects on transient
      // errors. If the server closes for real (401/403) the connection
      // stops on its own.
    };

    return () => {
      source.close();
    };
  }, [engagementId, onEvent]);
}
