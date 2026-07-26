"use client";

/**
 * Browser-persisted UI state, scoped to the signed-in Business Builder.
 *
 * Every one of these preferences used to live under a bare key —
 * "tbb.pipeline.view", "tbb.toast.lastSeenMs", and so on. localStorage
 * is per browser profile, not per user, so on any machine both Builders
 * sign into, the second one to set a view silently replaced the first
 * one's.
 *
 * For the pipeline that was worse than a local annoyance. The table
 * mirrors its filters back into `user_profiles.pipeline_column_prefs`
 * on a debounce, and the localStorage copy is applied AFTER the
 * server-rendered per-user copy — so the shared browser value won, then
 * got written into whichever Builder was signed in. One person's filter
 * choice ended up saved on the other person's row and followed them to
 * every other device they used.
 *
 * Keys are therefore suffixed with the Clerk user id. Two Builders
 * sharing a browser now keep entirely separate views.
 *
 * Reads and writes are no-ops until Clerk reports a signed-in user, so
 * nothing is ever written under an "unknown user" key and then adopted
 * by whoever signs in next.
 */

import { useMemo } from "react";
import { useUser } from "@clerk/nextjs";

/** Separator between the logical key and the owning user id. Chosen so
 *  it cannot collide with an existing key name. */
const NS = "::u:";

/**
 * Un-namespaced keys written by earlier builds.
 *
 * These are DELETED rather than migrated. Which Builder last wrote them
 * is unknowable, so adopting one would copy the other person's view into
 * this person's namespace — exactly the bug being fixed. Nothing of
 * value is lost: the pipeline view has an authoritative per-user copy in
 * the database that re-seeds on the next load, and the rest are
 * open/closed toggles that cost one click to set again.
 */
const LEGACY_KEYS = [
  "tbb.pipeline.view",
  "tbb_pipeline_view",
  "tbb_pipeline_collapsed",
  "tbb.sidebarPhasesOpen.v2",
  "tbb.toast.lastSeenMs",
  "tbb-push-intent",
  "tbb_buddy_muted_v2",
  "bbp-Coach-tour-seen",
  "bbp-guide-seen",
  "bbp-tour-seen",
];

/** Legacy key families written with a dynamic suffix. */
const LEGACY_PREFIXES = ["tbb.drawer."];

/** Set once the one-time purge has run in this browser profile. */
const PURGE_FLAG = "tbb.storage.scoped.v1";

let purgeChecked = false;

function purgeLegacyOnce(): void {
  if (purgeChecked || typeof window === "undefined") return;
  purgeChecked = true;
  try {
    if (window.localStorage.getItem(PURGE_FLAG) === "1") return;
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);

    // Prefix families. Anything already namespaced is left alone — the
    // `NS` check means a second purge could never eat the new keys.
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || key.includes(NS)) continue;
      if (LEGACY_PREFIXES.some((p) => key.startsWith(p))) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);

    window.localStorage.setItem(PURGE_FLAG, "1");
  } catch {
    /* private mode / storage disabled — nothing to purge */
  }
}

export type UserStorage = {
  /** True once Clerk has resolved a signed-in user and reads/writes
   *  will actually hit storage. Hydration effects should wait for it. */
  ready: boolean;
  get: (key: string) => string | null;
  getJSON: <T>(key: string) => T | null;
  set: (key: string, value: string) => void;
  setJSON: (key: string, value: unknown) => void;
  remove: (key: string) => void;
  /** Same scoping, backed by sessionStorage — for state that should die
   *  with the tab (an in-progress Buddy conversation, say) but must
   *  still not carry across a change of signed-in user, since signing
   *  out and back in as someone else keeps the same session. */
  getSessionJSON: <T>(key: string) => T | null;
  setSessionJSON: (key: string, value: unknown) => void;
  removeSession: (key: string) => void;
};

/**
 * Per-user wrapper around localStorage. Safe to call from any client
 * component under the Clerk provider.
 */
export function useUserStorage(): UserStorage {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? null;

  return useMemo<UserStorage>(() => {
    const ready = isLoaded && Boolean(userId);
    const scoped = (key: string) => `${key}${NS}${userId}`;

    const guard = <T>(fn: () => T, fallback: T): T => {
      if (!ready || typeof window === "undefined") return fallback;
      purgeLegacyOnce();
      try {
        return fn();
      } catch {
        return fallback;
      }
    };

    return {
      ready,
      get: (key) =>
        guard(() => window.localStorage.getItem(scoped(key)), null),
      getJSON: <T,>(key: string) =>
        guard<T | null>(() => {
          const raw = window.localStorage.getItem(scoped(key));
          return raw ? (JSON.parse(raw) as T) : null;
        }, null),
      set: (key, value) => {
        guard(() => window.localStorage.setItem(scoped(key), value), undefined);
      },
      setJSON: (key, value) => {
        guard(
          () =>
            window.localStorage.setItem(scoped(key), JSON.stringify(value)),
          undefined,
        );
      },
      remove: (key) => {
        guard(() => window.localStorage.removeItem(scoped(key)), undefined);
      },
      getSessionJSON: <T,>(key: string) =>
        guard<T | null>(() => {
          const raw = window.sessionStorage.getItem(scoped(key));
          return raw ? (JSON.parse(raw) as T) : null;
        }, null),
      setSessionJSON: (key, value) => {
        guard(
          () =>
            window.sessionStorage.setItem(scoped(key), JSON.stringify(value)),
          undefined,
        );
      },
      removeSession: (key) => {
        guard(() => window.sessionStorage.removeItem(scoped(key)), undefined);
      },
    };
  }, [isLoaded, userId]);
}
