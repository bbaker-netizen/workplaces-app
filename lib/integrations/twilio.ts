/**
 * Twilio client — SMS + WhatsApp send paths.
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
 *   WhatsApp:
 *   - TWILIO_WHATSAPP_FROM — WhatsApp sender id, in the form
 *     "whatsapp:+14155238886" (Twilio sandbox) or
 *     "whatsapp:+1XXXXXXXXXX" (production, after Meta business approval).
 *
 * When required pieces are missing, the functions throw a friendly
 * error so the UI can show "Configure Twilio first" instead of a
 * generic crash.
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

function whatsappFrom(): string {
  const v = process.env.TWILIO_WHATSAPP_FROM;
  if (!v) {
    throw new Error(
      "Twilio WhatsApp not configured. Set TWILIO_WHATSAPP_FROM in Netlify env (e.g. whatsapp:+14155238886).",
    );
  }
  return v;
}

export function isTwilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

export function isWhatsAppConfigured(): boolean {
  return isTwilioConfigured() && Boolean(process.env.TWILIO_WHATSAPP_FROM);
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

type PostMessageInput =
  | { kind: "sms"; to: string; body: string }
  | { kind: "whatsapp"; to: string; body: string };

async function postMessage(input: PostMessageInput): Promise<TwilioMessageResponse> {
  const { accountSid, authToken } = creds();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams();
  params.set("To", input.to);
  params.set("Body", input.body);

  if (input.kind === "sms") {
    const sender = smsSender();
    if (sender.kind === "service") {
      params.set("MessagingServiceSid", sender.sid);
    } else {
      params.set("From", sender.from);
    }
  } else {
    // WhatsApp always sends From a whatsapp: address.
    params.set("From", whatsappFrom());
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
  return (await res.json()) as TwilioMessageResponse;
}

export async function sendSms(args: {
  to: string;
  body: string;
}): Promise<{ messageSid: string }> {
  const r = await postMessage({ kind: "sms", to: args.to, body: args.body });
  return { messageSid: r.sid };
}

export async function sendWhatsApp(args: {
  to: string; // E.164 number; we'll prefix "whatsapp:" automatically
  body: string;
}): Promise<{ messageSid: string }> {
  const to = args.to.startsWith("whatsapp:")
    ? args.to
    : `whatsapp:${args.to.replace(/[^+\d]/g, "")}`;
  const r = await postMessage({ kind: "whatsapp", to, body: args.body });
  return { messageSid: r.sid };
}
