/**
 * Google Calendar client — minimal wrapper around the Google Calendar v3 API.
 *
 * Scope: we use `https://www.googleapis.com/auth/calendar.events` so the
 * tokens can read AND write events on the user's calendars but cannot
 * see other Google data (Gmail, Drive). That keeps the consent screen
 * narrow and the security exposure small.
 *
 * Tokens stored encrypted via lib/crypto/secret-vault.
 */

import { and, eq } from "drizzle-orm";
import {
  googleCalendarEventMappings,
  googleCalendarTokens,
  sessionSeriesCalendarMappings,
  type GoogleCalendarToken,
} from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-vault";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";

/**
 * Scope set for the unified Google connection.
 *
 *   - calendar.events — read/write calendar events for BBS-session sync.
 *   - gmail.readonly — read sent + received messages, to auto-capture
 *     client emails into client_communications. Personal email is
 *     ignored — only messages where a participant matches a prospect
 *     contact or engagement member get written through.
 *   - gmail.send — send emails on behalf of the connected user, so
 *     replies composed inside the app land in the recipient's inbox
 *     as if Bruce had sent them from Gmail directly. We don't request
 *     gmail.modify (which would let us mark messages read/archive); the
 *     CRM never touches the user's mailbox state.
 *   - drive.readonly — read/list any Drive folder Bruce shares (the
 *     read-only "paste a folder URL" mirror, and listing files added
 *     directly in Drive).
 *   - drive.file — write access to files + folders the app creates, for
 *     the two-way Documents sync (managed folder + upload mirroring).
 *     Non-sensitive, so it doesn't need extra Google verification.
 *   - openid email — identifies the connected Google account.
 */
export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file openid email";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const API_BASE = "https://www.googleapis.com/calendar/v3";

function clientCreds() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google Calendar OAuth env vars missing. Set GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, and GOOGLE_CALENDAR_REDIRECT_URI in Netlify.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/* ----------------------------- OAuth ----------------------------- */

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = clientCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent", // ensures we always get a refresh_token back
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type ExchangedTokens = {
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresIn: number; // seconds
};

export async function exchangeCodeForTokens(
  code: string,
): Promise<ExchangedTokens> {
  const { clientId, clientSecret, redirectUri } = clientCreds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Google Calendar token exchange failed: ${res.status} ${text}`,
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    scope: string;
    expires_in: number;
  };
  if (!json.refresh_token) {
    throw new Error(
      "Google didn't return a refresh_token. Revoke the prior consent at https://myaccount.google.com/permissions and try Connect again.",
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    scope: json.scope,
    expiresIn: json.expires_in,
  };
}

/**
 * Thrown when Google's refresh token is dead (invalid_grant). The only
 * fix is for the user to reconnect Google — callers should surface a
 * "Reconnect Google" prompt rather than a raw error.
 */
export class GoogleReconnectRequiredError extends Error {
  readonly reconnectRequired = true as const;
  constructor(message: string) {
    super(message);
    this.name = "GoogleReconnectRequiredError";
  }
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const { clientId, clientSecret } = clientCreds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // invalid_grant = the refresh token itself is dead (revoked, expired,
    // or issued by a different OAuth client). No retry fixes this — the
    // user has to reconnect Google. Signal that distinctly.
    if (text.includes("invalid_grant")) {
      throw new GoogleReconnectRequiredError(
        `Google refresh token is no longer valid: ${res.status} ${text}`,
      );
    }
    throw new Error(
      `Google Calendar token refresh failed: ${res.status} ${text}`,
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}

/* --------------------------- Token storage --------------------------- */

export async function storeUserTokens(args: {
  orgId: string;
  userProfileId: string;
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  scope: string;
  googleEmail?: string | null;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + args.expiresIn * 1000);
  await withTenantContext(args.orgId, async (tx) => {
    await tx
      .insert(googleCalendarTokens)
      .values({
        userProfileId: args.userProfileId,
        orgId: args.orgId,
        refreshTokenEncrypted: encryptSecret(args.refreshToken),
        accessTokenEncrypted: encryptSecret(args.accessToken),
        accessTokenExpiresAt: expiresAt,
        scope: args.scope,
        googleEmail: args.googleEmail ?? null,
      })
      .onConflictDoUpdate({
        target: googleCalendarTokens.userProfileId,
        set: {
          refreshTokenEncrypted: encryptSecret(args.refreshToken),
          accessTokenEncrypted: encryptSecret(args.accessToken),
          accessTokenExpiresAt: expiresAt,
          scope: args.scope,
          googleEmail: args.googleEmail ?? null,
          updatedAt: new Date(),
        },
      });
  });
}

/**
 * Get a valid access token for the given user, refreshing if needed.
 * Returns null when the user hasn't connected Google Calendar yet.
 */
export async function getValidAccessToken(
  userProfileId: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<{ token: string; calendarId: string; orgId: string } | null> {
  const row = await withSystemContext(async (tx) => {
    const [r] = await tx
      .select()
      .from(googleCalendarTokens)
      .where(eq(googleCalendarTokens.userProfileId, userProfileId))
      .limit(1);
    return r ?? null;
  });
  if (!row) return null;

  const now = Date.now();
  const expiresAt = row.accessTokenExpiresAt?.getTime() ?? 0;
  // Refresh 60s before expiry to avoid edge-case 401s. forceRefresh skips
  // the cache when Google rejected a token we still thought was valid
  // (revoked / superseded server-side).
  if (
    !opts.forceRefresh &&
    row.accessTokenEncrypted &&
    expiresAt - now > 60 * 1000
  ) {
    return {
      token: decryptSecret(row.accessTokenEncrypted),
      calendarId: row.calendarId,
      orgId: row.orgId,
    };
  }

  const refresh = decryptSecret(row.refreshTokenEncrypted);
  const { accessToken, expiresIn } = await refreshAccessToken(refresh);
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000);
  await withTenantContext(row.orgId, async (tx) => {
    await tx
      .update(googleCalendarTokens)
      .set({
        accessTokenEncrypted: encryptSecret(accessToken),
        accessTokenExpiresAt: newExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarTokens.userProfileId, userProfileId));
  });
  return { token: accessToken, calendarId: row.calendarId, orgId: row.orgId };
}

export async function disconnectUserTokens(
  orgId: string,
  userProfileId: string,
): Promise<void> {
  await withTenantContext(orgId, async (tx) => {
    await tx
      .delete(googleCalendarTokens)
      .where(eq(googleCalendarTokens.userProfileId, userProfileId));
  });
}

export async function getConnectionStatus(
  userProfileId: string,
): Promise<{ connected: false } | { connected: true; email: string | null }> {
  try {
    const row = await withSystemContext(async (tx) => {
      const [r] = await tx
        .select({
          googleEmail: googleCalendarTokens.googleEmail,
        })
        .from(googleCalendarTokens)
        .where(eq(googleCalendarTokens.userProfileId, userProfileId))
        .limit(1);
      return r ?? null;
    });
    if (!row) return { connected: false };
    return { connected: true, email: row.googleEmail ?? null };
  } catch (e) {
    // Table missing, permission denied, transient DB error — render the
    // page in "not connected" mode rather than 500.
    console.error("[google-calendar] getConnectionStatus failed:", e);
    return { connected: false };
  }
}

/**
 * Health-aware connection status. Unlike `getConnectionStatus` (which only
 * checks whether a token row exists), this actually exercises the refresh
 * token so a SILENTLY dead connection (revoked / expired refresh token —
 * the classic "it stopped syncing and nobody noticed" failure) surfaces as
 * `needs-reconnect` instead of looking healthy. Does at most one token
 * refresh, which is cached until expiry, so it's cheap to call per render.
 */
export type CalendarConnectionHealth =
  | { state: "not-connected" }
  | { state: "needs-reconnect"; email: string | null }
  | {
      state: "connected";
      email: string | null;
      connectedAt: Date | null;
    };

export async function getCalendarConnectionHealth(
  userProfileId: string,
): Promise<CalendarConnectionHealth> {
  let row: { googleEmail: string | null; createdAt: Date } | null = null;
  try {
    row = await withSystemContext(async (tx) => {
      const [r] = await tx
        .select({
          googleEmail: googleCalendarTokens.googleEmail,
          createdAt: googleCalendarTokens.createdAt,
        })
        .from(googleCalendarTokens)
        .where(eq(googleCalendarTokens.userProfileId, userProfileId))
        .limit(1);
      return r ?? null;
    });
  } catch (e) {
    console.error("[google-calendar] health lookup failed:", e);
    return { state: "not-connected" };
  }
  if (!row) return { state: "not-connected" };

  try {
    const token = await getValidAccessToken(userProfileId);
    if (!token) return { state: "not-connected" };
    return {
      state: "connected",
      email: row.googleEmail,
      connectedAt: row.createdAt,
    };
  } catch (e) {
    if (e instanceof GoogleReconnectRequiredError) {
      return { state: "needs-reconnect", email: row.googleEmail };
    }
    // Transient (network/Google 5xx) — don't cry wolf; the stored
    // connection is still presumed good.
    console.error("[google-calendar] health refresh probe failed:", e);
    return {
      state: "connected",
      email: row.googleEmail,
      connectedAt: row.createdAt,
    };
  }
}

/* ------------------------------ Events ------------------------------ */

export type GoogleEventPayload = {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: { email: string; displayName?: string }[];
};

async function api<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Calendar API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function createCalendarEvent(
  userProfileId: string,
  payload: GoogleEventPayload,
): Promise<{ eventId: string; calendarId: string }> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) throw new Error("Google Calendar not connected for this user.");
  const data = await api<{ id: string }>(
    token.token,
    `/calendars/${encodeURIComponent(token.calendarId)}/events?sendUpdates=all`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return { eventId: data.id, calendarId: token.calendarId };
}

/**
 * Create a Google Calendar event WITH a Google Meet link AND send the
 * invite to all attendees. Used by the prospect / client meeting
 * scheduler — Google handles sending the calendar invite emails so we
 * don't have to compose them.
 */
/** Calendar event attachment. Google Calendar's attachments field
 *  works for Drive files when you supply `fileUrl` + `fileId`. The
 *  recipient sees a paperclip icon on the event with one-click open. */
export type CalendarAttachment = {
  fileUrl: string;
  fileId?: string | null;
  title: string;
  mimeType?: string | null;
  iconLink?: string | null;
};

export async function createMeetingWithInvite(
  userProfileId: string,
  payload: GoogleEventPayload & {
    addMeetLink?: boolean;
    /** Array of RFC-5545 RRULE strings, e.g. ["RRULE:FREQ=WEEKLY"].
     *  Omitted / empty array = one-off event. */
    recurrence?: string[];
    /** Up to 25 Drive file attachments. Non-Drive attachments are
     *  rejected by Google Calendar's API — for arbitrary URLs we
     *  append them to the event description instead (see caller). */
    attachments?: CalendarAttachment[];
  },
): Promise<{
  eventId: string;
  calendarId: string;
  hangoutLink: string | null;
  htmlLink: string | null;
}> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) throw new Error("Google Calendar not connected for this user.");

  const body: Record<string, unknown> = {
    summary: payload.summary,
    description: payload.description,
    location: payload.location,
    start: payload.start,
    end: payload.end,
    attendees: payload.attendees,
  };
  if (payload.recurrence && payload.recurrence.length > 0) {
    body.recurrence = payload.recurrence;
  }
  if (payload.addMeetLink) {
    body.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  if (payload.attachments && payload.attachments.length > 0) {
    body.attachments = payload.attachments.map((a) => {
      const out: Record<string, unknown> = {
        fileUrl: a.fileUrl,
        title: a.title,
      };
      if (a.fileId) out.fileId = a.fileId;
      if (a.mimeType) out.mimeType = a.mimeType;
      if (a.iconLink) out.iconLink = a.iconLink;
      return out;
    });
  }

  // conferenceDataVersion=1 is mandatory to create Meet links.
  // sendUpdates=all → Google emails the calendar invite to attendees.
  // supportsAttachments=true unlocks the attachments field.
  const qs = new URLSearchParams({
    sendUpdates: "all",
    conferenceDataVersion: payload.addMeetLink ? "1" : "0",
    supportsAttachments: "true",
  });

  const data = await api<{
    id: string;
    hangoutLink?: string;
    htmlLink?: string;
  }>(
    token.token,
    `/calendars/${encodeURIComponent(token.calendarId)}/events?${qs.toString()}`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return {
    eventId: data.id,
    calendarId: token.calendarId,
    hangoutLink: data.hangoutLink ?? null,
    htmlLink: data.htmlLink ?? null,
  };
}

export async function updateCalendarEvent(
  userProfileId: string,
  eventId: string,
  calendarId: string,
  payload: GoogleEventPayload,
): Promise<void> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) return; // user disconnected — silently no-op
  await api(
    token.token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
      eventId,
    )}?sendUpdates=all`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export async function deleteCalendarEvent(
  userProfileId: string,
  eventId: string,
  calendarId: string,
): Promise<void> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) return;
  try {
    await api(
      token.token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
        eventId,
      )}?sendUpdates=all`,
      { method: "DELETE" },
    );
  } catch (e) {
    // Already gone is fine.
    if (e instanceof Error && /404|410/.test(e.message)) return;
    throw e;
  }
}

/* ----------------------------- BBS sync ----------------------------- */

/**
 * Idempotent push of a BBS session into the user's Google Calendar.
 * Best-effort: any failure is logged and swallowed so the in-app
 * session create/update succeeds even if Google is unreachable.
 */
export async function syncBbsSessionToGoogle(args: {
  orgId: string;
  userProfileId: string;
  bbsSessionId: string;
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  location?: string;
}): Promise<void> {
  try {
    const existing = await withTenantContext(args.orgId, async (tx) => {
      const [m] = await tx
        .select()
        .from(googleCalendarEventMappings)
        .where(
          and(
            eq(googleCalendarEventMappings.bbsSessionId, args.bbsSessionId),
            eq(googleCalendarEventMappings.userProfileId, args.userProfileId),
          ),
        )
        .limit(1);
      return m ?? null;
    });

    const payload: GoogleEventPayload = {
      summary: args.summary,
      description: args.description,
      location: args.location,
      start: { dateTime: args.startAt.toISOString(), timeZone: "America/Edmonton" },
      end: { dateTime: args.endAt.toISOString(), timeZone: "America/Edmonton" },
    };

    if (existing) {
      await updateCalendarEvent(
        args.userProfileId,
        existing.googleEventId,
        existing.googleCalendarId,
        payload,
      );
      await withTenantContext(args.orgId, async (tx) => {
        await tx
          .update(googleCalendarEventMappings)
          .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
          .where(eq(googleCalendarEventMappings.id, existing.id));
      });
    } else {
      const created = await createCalendarEvent(args.userProfileId, payload);
      await withTenantContext(args.orgId, async (tx) => {
        await tx.insert(googleCalendarEventMappings).values({
          orgId: args.orgId,
          bbsSessionId: args.bbsSessionId,
          userProfileId: args.userProfileId,
          googleEventId: created.eventId,
          googleCalendarId: created.calendarId,
        });
      });
    }
  } catch (e) {
    console.error("[google-calendar] sync failed:", e);
  }
}

/**
 * Push a recurring session series to the creator's Google Calendar as
 * ONE event carrying an RRULE.
 *
 * Deliberately creates the event on the creating user's own calendar
 * with NO attendees. Adding teammates as attendees would make Google
 * email them an invitation on the user's behalf, which is not something
 * to trigger as a side effect of defining a schedule — the teammate can
 * be added from Google, or each Business Builder can create their own.
 *
 * Best-effort, like every other calendar push here: a failure is logged
 * and swallowed so the series still exists in The Builder.
 */
export async function syncSeriesToGoogle(args: {
  orgId: string;
  userProfileId: string;
  sessionSeriesId: string;
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  recurrence: string[];
}): Promise<void> {
  try {
    const existing = await withTenantContext(args.orgId, async (tx) => {
      const [m] = await tx
        .select()
        .from(sessionSeriesCalendarMappings)
        .where(
          and(
            eq(
              sessionSeriesCalendarMappings.sessionSeriesId,
              args.sessionSeriesId,
            ),
            eq(sessionSeriesCalendarMappings.userProfileId, args.userProfileId),
          ),
        )
        .limit(1);
      return m ?? null;
    });

    const payload: GoogleEventPayload = {
      summary: args.summary,
      description: args.description,
      start: {
        dateTime: args.startAt.toISOString(),
        timeZone: "America/Edmonton",
      },
      end: { dateTime: args.endAt.toISOString(), timeZone: "America/Edmonton" },
    };

    if (existing) {
      await updateCalendarEvent(
        args.userProfileId,
        existing.googleEventId,
        existing.googleCalendarId,
        payload,
      );
      await withTenantContext(args.orgId, async (tx) => {
        await tx
          .update(sessionSeriesCalendarMappings)
          .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
          .where(eq(sessionSeriesCalendarMappings.id, existing.id));
      });
      return;
    }

    const created = await createMeetingWithInvite(args.userProfileId, {
      ...payload,
      recurrence: args.recurrence,
    });
    await withTenantContext(args.orgId, async (tx) => {
      await tx.insert(sessionSeriesCalendarMappings).values({
        orgId: args.orgId,
        sessionSeriesId: args.sessionSeriesId,
        userProfileId: args.userProfileId,
        googleEventId: created.eventId,
        googleCalendarId: created.calendarId,
      });
    });
  } catch (e) {
    console.error("[google-calendar] series sync failed:", e);
  }
}

/** Remove the recurring event when a series is ended. */
export async function removeSeriesFromGoogle(args: {
  orgId: string;
  userProfileId: string;
  sessionSeriesId: string;
}): Promise<void> {
  try {
    const existing = await withTenantContext(args.orgId, async (tx) => {
      const [m] = await tx
        .select()
        .from(sessionSeriesCalendarMappings)
        .where(
          and(
            eq(
              sessionSeriesCalendarMappings.sessionSeriesId,
              args.sessionSeriesId,
            ),
            eq(sessionSeriesCalendarMappings.userProfileId, args.userProfileId),
          ),
        )
        .limit(1);
      return m ?? null;
    });
    if (!existing) return;
    await deleteCalendarEvent(
      args.userProfileId,
      existing.googleEventId,
      existing.googleCalendarId,
    );
    await withTenantContext(args.orgId, async (tx) => {
      await tx
        .delete(sessionSeriesCalendarMappings)
        .where(eq(sessionSeriesCalendarMappings.id, existing.id));
    });
  } catch (e) {
    console.error("[google-calendar] series remove failed:", e);
  }
}

export async function removeBbsSessionFromGoogle(args: {
  orgId: string;
  userProfileId: string;
  bbsSessionId: string;
}): Promise<void> {
  try {
    const existing = await withTenantContext(args.orgId, async (tx) => {
      const [m] = await tx
        .select()
        .from(googleCalendarEventMappings)
        .where(
          and(
            eq(googleCalendarEventMappings.bbsSessionId, args.bbsSessionId),
            eq(googleCalendarEventMappings.userProfileId, args.userProfileId),
          ),
        )
        .limit(1);
      return m ?? null;
    });
    if (!existing) return;
    await deleteCalendarEvent(
      args.userProfileId,
      existing.googleEventId,
      existing.googleCalendarId,
    );
    await withTenantContext(args.orgId, async (tx) => {
      await tx
        .delete(googleCalendarEventMappings)
        .where(eq(googleCalendarEventMappings.id, existing.id));
    });
  } catch (e) {
    console.error("[google-calendar] remove failed:", e);
  }
}

/**
 * Pull events from the user's Google Calendar for a window of time.
 * Used by the in-app "Calendar" view to show the user's external
 * commitments alongside scheduled BBS sessions.
 */
export type ExternalEvent = {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  location: string | null;
  htmlLink: string | null;
  source: "google";
};

export async function listExternalEvents(
  userProfileId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<ExternalEvent[]> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) return [];
  const params = new URLSearchParams({
    timeMin: rangeStart.toISOString(),
    timeMax: rangeEnd.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "200",
  });
  const data = await api<{
    items: {
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      location?: string;
      htmlLink?: string;
    }[];
  }>(
    token.token,
    `/calendars/${encodeURIComponent(token.calendarId)}/events?${params.toString()}`,
  );
  return (data.items ?? [])
    .map((e) => {
      const startStr = e.start?.dateTime ?? e.start?.date;
      const endStr = e.end?.dateTime ?? e.end?.date;
      if (!startStr || !endStr) return null;
      return {
        id: e.id,
        summary: e.summary ?? "(no title)",
        start: new Date(startStr),
        end: new Date(endStr),
        location: e.location ?? null,
        htmlLink: e.htmlLink ?? null,
        source: "google" as const,
      };
    })
    .filter((x): x is ExternalEvent => x !== null);
}

/**
 * Pull events shaped for the auto-sync job: attendee emails (for matching
 * to an engagement), event status (to detect cancellations), and a
 * virtual/in-person hint. `showDeleted` is on so cancellations surface as
 * status==="cancelled" rather than silently vanishing.
 */
export type SyncEvent = {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  status: string;
  attendeeEmails: string[];
  isVirtual: boolean;
};

export async function listEventsForSync(
  token: string,
  calendarId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<SyncEvent[]> {
  const params = new URLSearchParams({
    timeMin: rangeStart.toISOString(),
    timeMax: rangeEnd.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    showDeleted: "true",
  });
  const data = await api<{
    items: {
      id: string;
      summary?: string;
      status?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      location?: string;
      hangoutLink?: string;
      conferenceData?: unknown;
      attendees?: { email?: string }[];
    }[];
  }>(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
  );
  return (data.items ?? [])
    .map((e) => {
      // Only timed events become sessions — skip all-day entries.
      const startStr = e.start?.dateTime;
      if (!startStr) return null;
      const endStr = e.end?.dateTime ?? e.end?.date ?? startStr;
      const locationVirtual = /\b(zoom|meet\.google|teams\.microsoft|https?:\/\/)/i.test(
        e.location ?? "",
      );
      const isVirtual =
        Boolean(e.hangoutLink) || Boolean(e.conferenceData) || locationVirtual;
      return {
        id: e.id,
        summary: e.summary ?? "(no title)",
        start: new Date(startStr),
        end: new Date(endStr),
        status: e.status ?? "confirmed",
        attendeeEmails: (e.attendees ?? [])
          .map((a) => (a.email ?? "").toLowerCase())
          .filter(Boolean),
        isVirtual,
      };
    })
    .filter((x): x is SyncEvent => x !== null);
}

/** Cheap check: does this user have a stored Google connection at all?
 *  Distinguishes "never connected" from "connected but the API call
 *  failed" so callers can show the right message. */
export async function hasGoogleConnection(
  userProfileId: string,
): Promise<boolean> {
  const row = await withSystemContext(async (tx) => {
    const [r] = await tx
      .select({ id: googleCalendarTokens.userProfileId })
      .from(googleCalendarTokens)
      .where(eq(googleCalendarTokens.userProfileId, userProfileId))
      .limit(1);
    return r ?? null;
  });
  return Boolean(row);
}

/* ------------- Google-owned internal touch-base series ------------- */

export type RecurringSeriesOption = {
  /** The master recurring event id — stable link key. */
  recurringEventId: string;
  calendarId: string;
  summary: string;
  /** Human-readable cadence line built from the RRULE, best-effort. */
  scheduleHint: string | null;
  /** The next upcoming instance start, for display. */
  nextStart: Date | null;
};

/**
 * List the recurring events on the user's primary calendar, for the
 * "link your touch-base" picker. Uses singleEvents=false so Google
 * returns the recurring MASTERS (each carrying an RRULE) rather than
 * expanded instances.
 */
export async function listRecurringSeries(
  userProfileId: string,
): Promise<RecurringSeriesOption[]> {
  const auth = await getValidAccessToken(userProfileId);
  if (!auth) return [];

  // Discover by EXPANDED upcoming instances (singleEvents=true), not by
  // recurring masters. Two reasons:
  //   1. A recurring event you were INVITED to (someone else organizes,
  //      e.g. Jen's touch-base) often has NO `recurrence` field on your
  //      copy of the master — so a master-based scan silently skips it.
  //      Its expanded INSTANCES, however, still carry `recurringEventId`.
  //   2. Expanded instances in a forward window are exactly "events that
  //      still meet", so old/ended series never appear.
  // We group the instances back into series by `recurringEventId`.
  const lookaheadEnd = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
    showDeleted: "false",
    timeMin: new Date().toISOString(),
    timeMax: lookaheadEnd.toISOString(),
  });
  const data = await api<{
    items: {
      id: string;
      summary?: string;
      status?: string;
      recurringEventId?: string;
      start?: { dateTime?: string; date?: string };
    }[];
  }>(
    auth.token,
    `/calendars/${encodeURIComponent(auth.calendarId)}/events?${params.toString()}`,
  );

  // Group the upcoming instances by their parent recurring event.
  const groups = new Map<
    string,
    { summary: string; starts: Date[] }
  >();
  for (const e of data.items ?? []) {
    if (!e.recurringEventId) continue; // only instances of a recurring event
    if (e.status === "cancelled") continue;
    const startStr = e.start?.dateTime;
    if (!startStr) continue; // timed events only
    const start = new Date(startStr);
    const g = groups.get(e.recurringEventId);
    if (g) {
      g.starts.push(start);
      // Prefer a non-empty title if the first instance lacked one.
      if (g.summary === "(no title)" && e.summary) g.summary = e.summary;
    } else {
      groups.set(e.recurringEventId, {
        summary: e.summary ?? "(no title)",
        starts: [start],
      });
    }
  }

  const out: RecurringSeriesOption[] = [];
  for (const [recurringEventId, g] of Array.from(groups.entries())) {
    g.starts.sort((a, b) => a.getTime() - b.getTime());
    out.push({
      recurringEventId,
      calendarId: auth.calendarId,
      summary: g.summary,
      // Infer cadence from the spacing between the first two occurrences.
      scheduleHint: hintFromSpacing(g.starts),
      nextStart: g.starts[0] ?? null,
    });
  }

  return out.sort(
    (a, b) => (a.nextStart?.getTime() ?? 0) - (b.nextStart?.getTime() ?? 0),
  );
}

/** Guess a cadence label from the gap between the first two occurrences. */
function hintFromSpacing(starts: Date[]): string | null {
  if (starts.length < 2) return "Recurring";
  const days = Math.round(
    (starts[1].getTime() - starts[0].getTime()) / (24 * 60 * 60 * 1000),
  );
  if (days <= 1) return "Daily";
  if (days <= 10) return "Weekly";
  if (days <= 18) return "Every 2 weeks";
  if (days <= 45) return "Monthly";
  return "Recurring";
}

export type SeriesInstance = {
  /** Google instance id — the per-occurrence idempotency key. */
  instanceId: string;
  start: Date;
  end: Date;
  /** "cancelled" for an occurrence deleted/declined in Google. */
  status: string;
  isVirtual: boolean;
  summary: string;
};

/**
 * Instances of ONE recurring series in a window, discovered by expanding
 * the calendar (singleEvents=true) and filtering to the given
 * recurringEventId — same invited-event-robust path as the picker, and
 * avoids the events/{id}/instances endpoint (which can 404 for an event
 * you don't organize). showDeleted so a single cancelled occurrence comes
 * back with status=cancelled.
 */
export async function listSeriesInstancesExpanded(
  userProfileId: string,
  recurringEventId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<SeriesInstance[]> {
  const auth = await getValidAccessToken(userProfileId);
  if (!auth) return [];
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
    showDeleted: "true",
    timeMin: rangeStart.toISOString(),
    timeMax: rangeEnd.toISOString(),
  });
  const data = await api<{
    items: {
      id: string;
      summary?: string;
      status?: string;
      recurringEventId?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      originalStartTime?: { dateTime?: string; date?: string };
      location?: string;
      hangoutLink?: string;
      conferenceData?: unknown;
    }[];
  }>(
    auth.token,
    `/calendars/${encodeURIComponent(auth.calendarId)}/events?${params.toString()}`,
  );

  return (data.items ?? [])
    .filter((e) => e.recurringEventId === recurringEventId)
    .map((e) => {
      // Cancelled occurrences may carry only originalStartTime.
      const startStr = e.start?.dateTime ?? e.originalStartTime?.dateTime;
      if (!startStr) return null;
      const endStr = e.end?.dateTime ?? e.end?.date ?? startStr;
      const locationVirtual = /\b(zoom|meet\.google|teams\.microsoft|https?:\/\/)/i.test(
        e.location ?? "",
      );
      return {
        instanceId: e.id,
        start: new Date(startStr),
        end: new Date(endStr),
        status: e.status ?? "confirmed",
        isVirtual:
          Boolean(e.hangoutLink) || Boolean(e.conferenceData) || locationVirtual,
        summary: e.summary ?? "(no title)",
      };
    })
    .filter((x): x is SeriesInstance => x !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Pull the connected Google account email via the userinfo endpoint. */
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

// Keep the token type reachable for callers.
export type { GoogleCalendarToken };
