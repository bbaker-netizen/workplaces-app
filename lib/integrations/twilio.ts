/**
 * Twilio client — SMS send path.
 *
 * Pure HTTP wrapper over Twilio's REST API. No `twilio` npm package
 * to keep the bundle small.
 *
 * Configuration:
 *   - TWILIO_ACCOUNT_SID  — Account SID from Twilio Console (starts AC...)
 *   - TWILIO_AUTH_TOKEN   — Auth Token from Twilio Console
 *
 *   SENDER — set EITHER of:
 *   - TWILIO_MESSAGING_SERVICE_SID — preferred. Messaging Service Sid
 *     (starts MG...). Twilio's modern recommended path: handles A2P
 *     10DLC registration, geographic routing, fallback numbers, etc.
 *   - TWILIO_PHONE_NUMBER — fallback. A single number in E.164 format
 *     (e.g. +17805551234). Useful for trial accounts or simple setups.
 *
 * When required pieces are missing, sendSms throws a friendly error so
 * the UI can show "Configure Twilio first" instead of a generic crash.
 */

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";

function creds(): { accountSid: string; authToken: string } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Netlify env.",
    );
  }
  return { accountSid, authToken };
}

/** Returns whichever SMS sender field is set — Messaging Service Sid
 *  preferred, single phone number as fallback. Throws if neither. */
function smsSender(): { kind: "service"; sid: string } | { kind: "from"; from: string } {
  const sid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (sid && sid.trim().length > 0) {
    return { kind: "service", sid };
  }
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (from && from.trim().length > 0) {
    return { kind: "from", from };
  }
  throw new Error(
    "Twilio SMS not configured. Set TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_PHONE_NUMBER in Netlify env.",
  );
}

export function isTwilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

export function isSmsConfigured(): boolean {
  return (
    isTwilioConfigured() &&
    Boolean(
      process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER,
    )
  );
}

type TwilioMessageResponse = {
  sid: string;
  status: string;
  from: string;
  to: string;
  error_code?: number | null;
  error_message?: string | null;
};

export async function sendSms(args: {
  to: string;
  body: string;
  /** Optional explicit E.164 "From" number. When provided it overrides the
   *  platform default (Messaging Service / TWILIO_PHONE_NUMBER) so a specific
   *  Business Builder's number is used as the sender. */
  from?: string;
}): Promise<{ messageSid: string }> {
  const { accountSid, authToken } = creds();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams();
  params.set("To", args.to);
  params.set("Body", args.body);

  if (args.from && args.from.trim().length > 0) {
    // Explicit per-Builder sender number takes precedence over the
    // platform Messaging Service / default number.
    params.set("From", args.from.trim());
  } else {
    const sender = smsSender();
    if (sender.kind === "service") {
      params.set("MessagingServiceSid", sender.sid);
    } else {
      params.set("From", sender.from);
    }
  }

  const res = await fetch(`${TWILIO_BASE}/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Twilio ${res.status}: ${text}`);
  }
  const r = (await res.json()) as TwilioMessageResponse;
  return { messageSid: r.sid };
}
