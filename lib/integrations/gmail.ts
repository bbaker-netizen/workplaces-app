/**
 * Gmail client — read-only access to the connected user's mailbox so the
 * app can capture client communications automatically.
 *
 * Privacy model: we DO NOT pull everything. The sync pipeline walks new
 * Gmail messages and only persists those where at least one participant
 * (From / To / Cc / Bcc) matches an email address already known to the
 * CRM (prospects.contact_email OR a user_profile email in an active
 * engagement). Anything that doesn't match is silently ignored — the
 * user's personal email never lands in the database.
 *
 * Token storage + refresh reuses the unified Google connection in
 * lib/integrations/google-calendar.ts. Adding Gmail to an existing
 * connection requires the user to re-authorize (so they explicitly grant
 * the gmail.readonly scope).
 */

import { eq, inArray } from "drizzle-orm";
import {
  clientCommunications,
  engagements,
  prospects,
  userProfiles,
  type ClientCommunication,
} from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";
import { getValidAccessToken } from "@/lib/integrations/google-calendar";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1";

/**
 * Minimal shape of a Gmail message we care about. Gmail's API returns a
 * superset; we parse only what's needed for matching + storage.
 */
type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string; // epoch ms as a string
  payload?: GmailPayload;
};

type GmailPayload = {
  headers?: { name: string; value: string }[];
  parts?: GmailPayload[];
  mimeType?: string;
  body?: { data?: string; size?: number };
};

async function gmail<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

/* --------------------------- send --------------------------- */

function encodeBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Escape header values that may contain non-ASCII via RFC 2047 encoded-word. */
function encodeHeader(value: string): string {
  // ASCII-safe → as-is. Non-ASCII → encoded-word (UTF-8 base64).
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  const b64 = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

export type EmailAttachment = {
  filename: string;
  /** MIME type, e.g. "application/pdf", "image/png". */
  contentType: string;
  /** Base64 string of the file bytes (without data: URL prefix). */
  base64: string;
};

export type SendEmailInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string; // plain text fallback
  /** Optional HTML body. When provided, the message is sent as
   *  multipart/alternative so clients pick the rendered HTML; clients
   *  that can't render HTML fall back to `body`. */
  bodyHtml?: string | null;
  /** Optional in-reply-to message id for threading. */
  inReplyTo?: string | null;
  references?: string | null;
  /** Optional file attachments. Total combined size capped at ~24MB
   *  (Gmail's 25MB limit minus headroom for headers + encoding overhead). */
  attachments?: EmailAttachment[];
};

const GMAIL_TOTAL_LIMIT_BYTES = 24 * 1024 * 1024;

/**
 * Send an email through the connected user's Gmail account. Returns
 * the gmail message id + thread id on success. Supports attachments
 * via multipart/mixed MIME.
 */
export async function sendGmailMessage(
  userProfileId: string,
  fromAddress: string,
  input: SendEmailInput,
): Promise<{ messageId: string; threadId: string }> {
  const { getValidAccessToken } = await import("./google-calendar");
  const token = await getValidAccessToken(userProfileId);
  if (!token) {
    throw new Error("Google not connected. Visit /business-builder/profile/google-calendar.");
  }

  const hasAttachments =
    input.attachments && input.attachments.length > 0;
  const hasHtml = !!(input.bodyHtml && input.bodyHtml.trim().length > 0);

  if (hasAttachments) {
    // Quick total-size guard. Base64 expands payload by 4/3, so we
    // approximate decoded bytes by reversing the ratio.
    const totalBase64 = input.attachments!.reduce(
      (s, a) => s + a.base64.length,
      0,
    );
    const approxBytes = Math.floor((totalBase64 * 3) / 4);
    if (approxBytes > GMAIL_TOTAL_LIMIT_BYTES) {
      throw new Error(
        "Attachments are too big. Gmail caps total at 25MB — keep under 24MB to be safe.",
      );
    }
  }

  const baseHeaders: string[] = [];
  baseHeaders.push(`From: ${encodeHeader(fromAddress)}`);
  baseHeaders.push(`To: ${input.to.map(encodeHeader).join(", ")}`);
  if (input.cc && input.cc.length > 0) {
    baseHeaders.push(`Cc: ${input.cc.map(encodeHeader).join(", ")}`);
  }
  if (input.bcc && input.bcc.length > 0) {
    baseHeaders.push(`Bcc: ${input.bcc.map(encodeHeader).join(", ")}`);
  }
  baseHeaders.push(`Subject: ${encodeHeader(input.subject)}`);
  baseHeaders.push("MIME-Version: 1.0");
  if (input.inReplyTo) baseHeaders.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) baseHeaders.push(`References: ${input.references}`);

  /** Build the "body" portion (text-only, or multipart/alternative if HTML). */
  function bodyBlock(): { headers: string[]; body: string } {
    if (!hasHtml) {
      return {
        headers: [
          "Content-Type: text/plain; charset=UTF-8",
          "Content-Transfer-Encoding: 8bit",
        ],
        body: input.body,
      };
    }
    const altBoundary = `=_ALT_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const altParts: string[] = [];
    altParts.push(
      [
        `--${altBoundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        input.body,
      ].join("\r\n"),
    );
    altParts.push(
      [
        `--${altBoundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        input.bodyHtml!,
      ].join("\r\n"),
    );
    altParts.push(`--${altBoundary}--`);
    return {
      headers: [`Content-Type: multipart/alternative; boundary="${altBoundary}"`],
      body: altParts.join("\r\n"),
    };
  }

  let raw: string;
  if (!hasAttachments) {
    const bb = bodyBlock();
    raw =
      [...baseHeaders, ...bb.headers].join("\r\n") +
      "\r\n\r\n" +
      bb.body;
  } else {
    const mixedBoundary = `=_TBB_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const headers = [
      ...baseHeaders,
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ];
    const parts: string[] = [];

    // First part: the body (text-only or multipart/alternative nested).
    const bb = bodyBlock();
    parts.push(
      [`--${mixedBoundary}`, ...bb.headers, "", bb.body].join("\r\n"),
    );

    // Attachment parts.
    for (const att of input.attachments!) {
      // Break base64 into 76-char lines per RFC 2045 to keep some
      // mail servers happy.
      const wrapped = att.base64.replace(/(.{76})/g, "$1\r\n").trimEnd();
      const safeFilename = att.filename.replace(/"/g, "");
      parts.push(
        [
          `--${mixedBoundary}`,
          `Content-Type: ${att.contentType}; name="${safeFilename}"`,
          `Content-Disposition: attachment; filename="${safeFilename}"`,
          "Content-Transfer-Encoding: base64",
          "",
          wrapped,
        ].join("\r\n"),
      );
    }
    parts.push(`--${mixedBoundary}--`);

    raw = headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
  }

  const rawEncoded = encodeBase64Url(Buffer.from(raw, "utf8"));

  const RECONNECT_MSG =
    "Your Google connection needs to be reconnected before you can send email. " +
    "Open Settings → Integrations (or /business-builder/profile/google-calendar), " +
    "disconnect Google, then connect again.";

  const doSend = (accessToken: string) =>
    gmail<{ id: string; threadId: string }>(
      accessToken,
      `/users/me/messages/send`,
      {
        method: "POST",
        body: JSON.stringify({ raw: rawEncoded }),
      },
    );

  let result: { id: string; threadId: string };
  try {
    result = await doSend(token.token);
  } catch (e) {
    // A Gmail 401 means Google rejected the token we held — it was revoked
    // or superseded server-side even though it hadn't clock-expired, so the
    // cached token check didn't catch it. Force-mint a fresh token and retry
    // once. If the refresh token is itself dead, tell the user to reconnect
    // rather than leaking a raw Gmail error.
    if (!(e instanceof Error) || !e.message.includes("Gmail API 401")) {
      throw e;
    }
    const fresh = await getValidAccessToken(userProfileId, {
      forceRefresh: true,
    }).catch(() => null);
    if (!fresh) {
      throw new Error(RECONNECT_MSG);
    }
    try {
      result = await doSend(fresh.token);
    } catch (e2) {
      if (e2 instanceof Error && e2.message.includes("Gmail API 401")) {
        throw new Error(RECONNECT_MSG);
      }
      throw e2;
    }
  }
  return { messageId: result.id, threadId: result.threadId };
}

/* --------------------------- list + get --------------------------- */

/**
 * List ALL message ids newer than the given epoch ms, paginating through
 * every page. Uses Gmail's `after:` search operator so we only ever look at
 * new mail, never the full mailbox.
 *
 * Why pagination matters: the caller advances a watermark to the newest
 * message it processes. A single 100-id page returns only the NEWEST 100
 * messages since the watermark — so on any interval with more than 100 new
 * messages, the older ones would never be fetched, yet the watermark would
 * still jump to the newest, skipping them permanently. Paging through every
 * result closes that gap. `max` is a pure runaway guard; reaching it is
 * logged rather than silently truncated.
 */
export async function listMessagesSince(
  accessToken: string,
  sinceEpochMs: number,
  max = 1000,
): Promise<string[]> {
  const sinceSeconds = Math.floor(sinceEpochMs / 1000);
  const q = `after:${sinceSeconds}`;
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < max) {
    const params = new URLSearchParams({ q, maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await gmail<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(accessToken, `/users/me/messages?${params.toString()}`);
    for (const m of data.messages ?? []) ids.push(m.id);
    if (!data.nextPageToken) return ids;
    pageToken = data.nextPageToken;
  }
  console.warn(
    `[gmail-sync] listMessagesSince hit the ${max}-id cap — there was more ` +
      `new mail in one interval than a single run expects. The watermark ` +
      `will still advance; investigate if this recurs.`,
  );
  return ids.slice(0, max);
}

export async function getMessage(
  accessToken: string,
  id: string,
): Promise<GmailMessage> {
  return gmail<GmailMessage>(
    accessToken,
    `/users/me/messages/${encodeURIComponent(id)}?format=full`,
  );
}

/* --------------------------- parsing --------------------------- */

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function headersToMap(payload: GmailPayload | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const h of payload?.headers ?? []) {
    m.set(h.name.toLowerCase(), h.value);
  }
  return m;
}

/** Recurse through payload parts, collecting the first text/plain and text/html bodies. */
function extractBodies(
  payload: GmailPayload | undefined,
): { text: string; html: string | null } {
  const found = { text: "", html: null as string | null };
  function walk(p: GmailPayload | undefined) {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !found.text) {
      found.text = decodeBase64Url(p.body.data);
    } else if (p.mimeType === "text/html" && p.body?.data && !found.html) {
      found.html = decodeBase64Url(p.body.data);
    }
    for (const child of p.parts ?? []) walk(child);
  }
  walk(payload);
  if (!found.text && found.html) {
    // Crude HTML strip so we have at least a searchable text body.
    found.text = found.html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return { text: found.text, html: found.html };
}

const ADDR_REGEX = /[a-z0-9._+-]+@[a-z0-9.-]+/gi;

function extractAddresses(headerValue: string | undefined): string[] {
  if (!headerValue) return [];
  return Array.from(headerValue.matchAll(ADDR_REGEX)).map((m) =>
    m[0].toLowerCase(),
  );
}

/* --------------------------- matching --------------------------- */

/**
 * Resolve the best (single) prospect or engagement for a list of participant
 * email addresses, scoped to the caller's master org.
 *
 * Strategy: build a lookup once per sync run from prospects.contact_email
 * and user_profiles.email (for engagement membership). Match by literal
 * lower-cased equality. First match wins; prospect attachments are
 * preferred when both match.
 */
export type MatchLookup = {
  // email -> prospect id
  prospectByEmail: Map<string, string>;
  // email -> engagement id
  engagementByEmail: Map<string, string>;
  orgId: string;
};

export async function buildMatchLookup(masterOrgId: string): Promise<MatchLookup> {
  return withSystemContext(async (tx) => {
    const prospectRows = await tx
      .select({ id: prospects.id, email: prospects.contactEmail })
      .from(prospects)
      .where(eq(prospects.orgId, masterOrgId));
    const prospectByEmail = new Map<string, string>();
    for (const r of prospectRows) {
      if (r.email) prospectByEmail.set(r.email.toLowerCase(), r.id);
    }

    // Each engagement has its own org (client org). user_profiles in that
    // org with role client_lead / client_manager / client_employee are
    // the people whose emails we want to match against. engagements.orgId
    // IS the client org for that engagement (engagements live inside the
    // client tenant).
    const engRows = await tx
      .select({
        id: engagements.id,
        clientOrgId: engagements.orgId,
      })
      .from(engagements);
    const engByOrg = new Map<string, string>();
    for (const e of engRows) {
      if (e.clientOrgId) engByOrg.set(e.clientOrgId, e.id);
    }
    const orgIds = Array.from(engByOrg.keys());
    const engagementByEmail = new Map<string, string>();
    if (orgIds.length > 0) {
      const profiles = await tx
        .select({
          email: userProfiles.email,
          orgId: userProfiles.orgId,
        })
        .from(userProfiles)
        .where(inArray(userProfiles.orgId, orgIds));
      for (const p of profiles) {
        const engId = engByOrg.get(p.orgId);
        if (engId && p.email) {
          engagementByEmail.set(p.email.toLowerCase(), engId);
        }
      }
    }

    return { prospectByEmail, engagementByEmail, orgId: masterOrgId };
  });
}

export function matchParticipantToClient(
  lookup: MatchLookup,
  participantEmails: string[],
): { prospectId?: string; engagementId?: string } | null {
  for (const email of participantEmails) {
    const e = email.toLowerCase();
    const pid = lookup.prospectByEmail.get(e);
    if (pid) return { prospectId: pid };
  }
  for (const email of participantEmails) {
    const e = email.toLowerCase();
    const eng = lookup.engagementByEmail.get(e);
    if (eng) return { engagementId: eng };
  }
  return null;
}

/* --------------------------- sync --------------------------- */

/**
 * Pull new Gmail messages for a single user, write any that match a
 * known client into client_communications, and return a summary. Safe
 * to run repeatedly — dedupe on (org_id, channel="email", external_id).
 *
 * The `since` argument is the user's last successful sync watermark.
 * We use it directly in the Gmail search query so we never walk old
 * history.
 */
export async function syncUserGmail(args: {
  userProfileId: string;
  masterOrgId: string;
  since: Date;
  maxMessages?: number;
}): Promise<{ scanned: number; captured: number; latestAt: Date }> {
  const token = await getValidAccessToken(args.userProfileId);
  if (!token) {
    return { scanned: 0, captured: 0, latestAt: args.since };
  }
  const ids = await listMessagesSince(
    token.token,
    args.since.getTime(),
    args.maxMessages,
  );

  if (ids.length === 0) {
    return { scanned: 0, captured: 0, latestAt: args.since };
  }

  const lookup = await buildMatchLookup(args.masterOrgId);
  const ownerEmail = await ownerEmailFor(args.userProfileId);
  const ownerEmailLower = ownerEmail?.toLowerCase() ?? null;

  let captured = 0;
  let latest = args.since.getTime();

  for (const id of ids) {
    try {
      const r = await processGmailMessage({
        accessToken: token.token,
        messageId: id,
        lookup,
        ownerEmailLower,
        masterOrgId: args.masterOrgId,
        userProfileId: args.userProfileId,
      });
      if (r.internalEpoch > latest) latest = r.internalEpoch;
      if (r.captured) captured++;
    } catch (e) {
      console.error("[gmail-sync] message failed", id, e);
    }
  }

  return {
    scanned: ids.length,
    captured,
    latestAt: new Date(latest),
  };
}

/**
 * Fetch one Gmail message, match its participants to a known client, and
 * store it as a client_communications row (idempotent via
 * onConflictDoNothing on external_id). Shared by the forward sync and the
 * per-client backfill. Returns whether it was captured + the message's
 * internalDate so callers can advance a watermark.
 */
async function processGmailMessage(args: {
  accessToken: string;
  messageId: string;
  lookup: MatchLookup;
  ownerEmailLower: string | null;
  masterOrgId: string;
  userProfileId: string;
}): Promise<{ captured: boolean; internalEpoch: number }> {
  const msg = await getMessage(args.accessToken, args.messageId);
  const headers = headersToMap(msg.payload);
  const internalEpoch = Number(msg.internalDate ?? 0);

  const fromAddrs = extractAddresses(headers.get("from"));
  const toAddrs = extractAddresses(headers.get("to"));
  const ccAddrs = extractAddresses(headers.get("cc"));
  const bccAddrs = extractAddresses(headers.get("bcc"));
  const participants = [...fromAddrs, ...toAddrs, ...ccAddrs, ...bccAddrs];

  // Exclude the syncing user's own email from the match-set so a
  // self-as-prospect test record doesn't cause every email to match.
  const otherParticipants = args.ownerEmailLower
    ? participants.filter((p) => p.toLowerCase() !== args.ownerEmailLower)
    : participants;

  const match = matchParticipantToClient(args.lookup, otherParticipants);
  if (!match) return { captured: false, internalEpoch };

  const fromOwner = fromAddrs.some(
    (a) => args.ownerEmailLower && a.toLowerCase() === args.ownerEmailLower,
  );
  const direction = fromOwner ? "outbound" : "inbound";

  const { text, html } = extractBodies(msg.payload);
  const subject = headers.get("subject") ?? null;
  const occurredAt = internalEpoch ? new Date(internalEpoch) : new Date();
  const messageIdHeader = headers.get("message-id") ?? null;
  const threadKey =
    headers.get("references") ??
    headers.get("in-reply-to") ??
    msg.threadId ??
    null;

  await withTenantContext(args.masterOrgId, async (tx) => {
    await tx
      .insert(clientCommunications)
      .values({
        orgId: args.masterOrgId,
        prospectId: match.prospectId ?? null,
        engagementId: match.engagementId ?? null,
        channel: "email",
        direction,
        fromAddress: headers.get("from") ?? null,
        toAddresses: [...toAddrs, ...ccAddrs, ...bccAddrs],
        subject,
        body: text,
        bodyHtml: html,
        threadKey,
        externalId: messageIdHeader ?? msg.id,
        occurredAt,
        tags: [],
        createdByUserProfileId: args.userProfileId,
      })
      .onConflictDoNothing();
  });
  return { captured: true, internalEpoch };
}

/**
 * List Gmail message ids exchanged with a SPECIFIC address in the window.
 * Uses Gmail's `from:/to:` search so we pull only that contact's thread —
 * a handful of messages, not the whole mailbox — which keeps the backfill
 * fast and inside the function time limit. Paginates up to `max`.
 */
async function listMessagesWithAddress(
  accessToken: string,
  email: string,
  sinceEpochMs: number,
  max: number,
): Promise<string[]> {
  const sinceSeconds = Math.floor(sinceEpochMs / 1000);
  const safe = email.replace(/[()]/g, "");
  const q = `after:${sinceSeconds} (from:${safe} OR to:${safe} OR cc:${safe})`;
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < max) {
    const params = new URLSearchParams({ q, maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await gmail<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(accessToken, `/users/me/messages?${params.toString()}`);
    for (const m of data.messages ?? []) ids.push(m.id);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return ids.slice(0, max);
}

/**
 * One-time backfill of a single contact's email history. Searches Gmail
 * for messages to/from `contactEmail` over the last `sinceDays`, ignoring
 * the forward-only sync watermark, and stores every match. Idempotent —
 * already-synced messages are skipped on insert. Returns counts.
 */
export async function backfillContactEmails(args: {
  userProfileId: string;
  masterOrgId: string;
  contactEmail: string;
  sinceDays?: number;
  maxMessages?: number;
}): Promise<{ scanned: number; captured: number }> {
  const token = await getValidAccessToken(args.userProfileId);
  if (!token) return { scanned: 0, captured: 0 };

  const sinceMs = Date.now() - (args.sinceDays ?? 365) * 24 * 60 * 60 * 1000;
  const ids = await listMessagesWithAddress(
    token.token,
    args.contactEmail,
    sinceMs,
    args.maxMessages ?? 300,
  );
  if (ids.length === 0) return { scanned: 0, captured: 0 };

  const lookup = await buildMatchLookup(args.masterOrgId);
  const ownerEmailLower = (await ownerEmailFor(args.userProfileId))
    ?.toLowerCase() ?? null;

  let captured = 0;
  for (const id of ids) {
    try {
      const r = await processGmailMessage({
        accessToken: token.token,
        messageId: id,
        lookup,
        ownerEmailLower,
        masterOrgId: args.masterOrgId,
        userProfileId: args.userProfileId,
      });
      if (r.captured) captured++;
    } catch (e) {
      console.error("[gmail-backfill] message failed", id, e);
    }
  }
  return { scanned: ids.length, captured };
}


async function ownerEmailFor(userProfileId: string): Promise<string | null> {
  const row = await withSystemContext(async (tx) => {
    const [u] = await tx
      .select({ email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.id, userProfileId))
      .limit(1);
    return u ?? null;
  });
  return row?.email ?? null;
}

// Surface the row type for callers that want a thin re-export.
export type { ClientCommunication };
