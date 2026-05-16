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

export type SendEmailInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string; // plain text
  /** Optional in-reply-to message id for threading. */
  inReplyTo?: string | null;
  references?: string | null;
};

/**
 * Send an email through the connected user's Gmail account. Returns
 * the gmail message id + thread id on success.
 */
export async function sendGmailMessage(
  userProfileId: string,
  fromAddress: string,
  input: SendEmailInput,
): Promise<{ messageId: string; threadId: string }> {
  const { getValidAccessToken } = await import("./google-calendar");
  const token = await getValidAccessToken(userProfileId);
  if (!token) {
    throw new Error("Google not connected. Visit /coach/profile/google-calendar.");
  }

  const headers: string[] = [];
  headers.push(`From: ${encodeHeader(fromAddress)}`);
  headers.push(`To: ${input.to.map(encodeHeader).join(", ")}`);
  if (input.cc && input.cc.length > 0) {
    headers.push(`Cc: ${input.cc.map(encodeHeader).join(", ")}`);
  }
  if (input.bcc && input.bcc.length > 0) {
    headers.push(`Bcc: ${input.bcc.map(encodeHeader).join(", ")}`);
  }
  headers.push(`Subject: ${encodeHeader(input.subject)}`);
  headers.push("MIME-Version: 1.0");
  headers.push("Content-Type: text/plain; charset=UTF-8");
  headers.push("Content-Transfer-Encoding: 8bit");
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headers.push(`References: ${input.references}`);

  const raw = headers.join("\r\n") + "\r\n\r\n" + input.body;
  const rawEncoded = encodeBase64Url(Buffer.from(raw, "utf8"));

  const result = await gmail<{ id: string; threadId: string }>(
    token.token,
    `/users/me/messages/send`,
    {
      method: "POST",
      body: JSON.stringify({ raw: rawEncoded }),
    },
  );
  return { messageId: result.id, threadId: result.threadId };
}

/* --------------------------- list + get --------------------------- */

/**
 * List message ids newer than the given epoch ms. Uses Gmail's search
 * `after:` operator so we don't have to walk the full mailbox.
 */
export async function listMessagesSince(
  accessToken: string,
  sinceEpochMs: number,
  pageSize = 100,
): Promise<string[]> {
  const sinceSeconds = Math.floor(sinceEpochMs / 1000);
  const q = `after:${sinceSeconds}`;
  const params = new URLSearchParams({
    q,
    maxResults: String(pageSize),
  });
  const data = await gmail<{
    messages?: { id: string }[];
    nextPageToken?: string;
  }>(accessToken, `/users/me/messages?${params.toString()}`);
  return (data.messages ?? []).map((m) => m.id);
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
    args.maxMessages ?? 100,
  );

  if (ids.length === 0) {
    return { scanned: 0, captured: 0, latestAt: args.since };
  }

  const lookup = await buildMatchLookup(args.masterOrgId);

  let captured = 0;
  let latest = args.since.getTime();

  for (const id of ids) {
    try {
      const msg = await getMessage(token.token, id);
      const headers = headersToMap(msg.payload);
      const internalEpoch = Number(msg.internalDate ?? 0);
      if (internalEpoch > latest) latest = internalEpoch;

      const fromAddrs = extractAddresses(headers.get("from"));
      const toAddrs = extractAddresses(headers.get("to"));
      const ccAddrs = extractAddresses(headers.get("cc"));
      const bccAddrs = extractAddresses(headers.get("bcc"));
      const participants = [...fromAddrs, ...toAddrs, ...ccAddrs, ...bccAddrs];

      const match = matchParticipantToClient(lookup, participants);
      if (!match) continue;

      const ownerEmail = await ownerEmailFor(args.userProfileId);
      const fromOwner = fromAddrs.some(
        (a) => ownerEmail && a === ownerEmail.toLowerCase(),
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
      captured++;
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
