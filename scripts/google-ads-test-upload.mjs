/**
 * Prove the offline-conversion upload chain end to end via the Data Manager API
 * (datamanager.googleapis.com/v1/events:ingest).
 *
 * Default = VALIDATE-ONLY: Google fully validates auth (datamanager scope), the
 * destination (account + conversion action), timestamp and gclid — but records
 * NOTHING. Nothing is written to the ad account, nothing affects reporting/bids.
 *
 * Usage:
 *   node scripts/google-ads-test-upload.mjs <gclid> [booked|signed]
 *   node scripts/google-ads-test-upload.mjs <gclid> booked --live   # records
 *
 * With no gclid, a structurally-valid sample is used (still validate-only) to
 * prove the endpoint + destination resolve. Pass a REAL gclid for a true check.
 */

import fs from "node:fs";
import { resolve } from "node:path";
import { DateTime } from "luxon";

const envPath = resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const digits = (v) => (v ?? "").replace(/[^0-9]/g, "");
const customerId = digits(process.env.GOOGLE_ADS_CUSTOMER_ID);
const loginCustomerId = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

function conversionActionId(action) {
  const a = (action ?? "").trim();
  const m = a.match(/conversionActions\/(\d+)/);
  return m ? m[1] : a.replace(/[^0-9]/g, "");
}

const args = process.argv.slice(2);
const live = args.includes("--live");
const positional = args.filter((a) => !a.startsWith("--"));
const gclid = positional[0] ?? "Cj0KCQjwSAMPLEvalidateOnlyTestGclidNotARealClick1234567890abcdEF";
const kind = (positional[1] ?? "booked").toLowerCase();

const action =
  kind === "signed"
    ? process.env.GOOGLE_ADS_SIGNED_CONVERSION_ACTION
    : process.env.GOOGLE_ADS_BOOKED_CONVERSION_ACTION;

if (!action) {
  console.error(`  No conversion action for kind "${kind}" in .env.local. Aborting.`);
  process.exit(1);
}

async function accessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`OAuth token exchange failed (${res.status}): ${t}`);
  return JSON.parse(t).access_token;
}

const token = await accessToken();

const destination = {
  operatingAccount: { accountType: "GOOGLE_ADS", accountId: customerId },
  productDestinationId: conversionActionId(action),
};
if (loginCustomerId && loginCustomerId !== customerId) {
  destination.loginAccount = { accountType: "GOOGLE_ADS", accountId: loginCustomerId };
}

const eventTimestamp = DateTime.now()
  .setZone("America/Edmonton")
  .minus({ hours: 1 })
  .toISO({ suppressMilliseconds: true });

const body = JSON.stringify({
  destinations: [destination],
  events: [{ eventTimestamp, eventSource: "WEB", adIdentifiers: { gclid } }],
  validateOnly: !live,
});

console.log(`\n  Mode: ${live ? "LIVE (records a real conversion)" : "VALIDATE-ONLY (records nothing)"}`);
console.log(`  Endpoint: datamanager.googleapis.com/v1/events:ingest`);
console.log(`  Operating account: ${customerId}`);
console.log(`  Conversion action id: ${destination.productDestinationId} (${kind})`);
console.log(`  gclid: ${gclid.slice(0, 16)}… (${gclid.length} chars)`);
console.log(`  When: ${eventTimestamp}\n`);

const res = await fetch("https://datamanager.googleapis.com/v1/events:ingest", {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body,
});
const text = await res.text();
console.log(`  HTTP ${res.status}`);
console.log(text || "(empty body)");
console.log(
  `\n  Result: ${res.ok ? "✅ request accepted by Google" : "⚠️  see response above"}\n`,
);
process.exit(res.ok ? 0 : 1);
