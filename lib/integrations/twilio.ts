/**
 * Twilio client — SMS + WhatsApp send paths.
 *
 * Pure HTTP wrapper over Twilio's REST API. No `twilio` npm package
 * to keep the bundle small.
 *
 * Configuration:
 *   - TWILIO_ACCOUNT_SID  — Account SID from Twilio Console
 *   - TWILIO_AUTH_TOKEN   — Auth Token from Twilio Console
 *   - TWILIO_PHONE_NUMBER — Canadian / US number you bought for the
 *                            workspace, in E.164 format (e.g. +17805551234)
 *   - TWILIO_WHATSAPP_FROM — WhatsApp sender id, in the form
 *                            "whatsapp:+14155238886" (sandbox) or
 *                            "whatsapp:+1XXXXXXXXXX" (production, after
 *                            Meta business approval).
 *
 * When any of these are missing, the functions throw a friendly error
 * with the missing key, so the UI can show "Configure Twilio first"
 * instead of a generic crash.
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

function smsFrom(): string {
  const v = process.env.TWILIO_PHONE_NUMBER;
  if (!v) {
    throw new Error("Twilio SMS not configured. Set TWILIO_PHONE_NUMBER in Netlify env.");
  }
  return v;
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
  return isTwilioConfigured() && Boolean(process.env.TWILIO_PHONE_NUMBER);
}

type TwilioMessageResponse = {
  sid: string;
  status: string;
  from: string;
  to: string;
};

async function postMessage(args: {
  from: string;
  to: string;
  body: string;
}): Promise<TwilioMessageResponse> {
  const { accountSid, authToken } = creds();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams({
    From: args.from,
    To: args.to,
    Body: args.body,
  });
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
  const r = await postMessage({ from: smsFrom(), to: args.to, body: args.body });
  return { messageSid: r.sid };
}

export async function sendWhatsApp(args: {
  to: string; // E.164 number; we'll prefix "whatsapp:" automatically
  body: string;
}): Promise<{ messageSid: string }> {
  const to = args.to.startsWith("whatsapp:")
    ? args.to
    : `whatsapp:${args.to.replace(/[^+\d]/g, "")}`;
  const r = await postMessage({ from: whatsappFrom(), to, body: args.body });
  return { messageSid: r.sid };
}
