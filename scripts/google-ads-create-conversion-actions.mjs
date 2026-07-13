/**
 * Create (or find) the two Google Ads "import / offline" conversion actions the
 * booking-attribution sweep uploads into:
 *   - "Booked session"  → GOOGLE_ADS_BOOKED_CONVERSION_ACTION
 *   - "Client signed"   → GOOGLE_ADS_SIGNED_CONVERSION_ACTION
 * Both are type UPLOAD_CLICKS (fed by UploadClickConversions).
 *
 * Idempotent: it queries by name first and only creates what's missing, so it's
 * safe to run twice. On success it writes each resource name back into
 * .env.local. Reads all credentials from .env.local — nothing secret is printed.
 *
 * Run:  node scripts/google-ads-create-conversion-actions.mjs
 */

import fs from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function upsertEnvLocal(key, value) {
  const line = `${key}=${value}`;
  let contents = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(contents)) contents = contents.replace(re, line);
  else {
    if (contents.length && !contents.endsWith("\n")) contents += "\n";
    contents += line + "\n";
  }
  fs.writeFileSync(envPath, contents);
}

const API = "v22";
const digits = (v) => (v ?? "").replace(/[^0-9]/g, "");

const clientId = (process.env.GOOGLE_ADS_CLIENT_ID ?? "").trim();
const clientSecret = (process.env.GOOGLE_ADS_CLIENT_SECRET ?? "").trim();
const refreshToken = (process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "").trim();
const developerToken = (process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "").trim();
const customerId = digits(process.env.GOOGLE_ADS_CUSTOMER_ID);
const loginCustomerId = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

for (const [k, v] of Object.entries({
  GOOGLE_ADS_CLIENT_ID: clientId,
  GOOGLE_ADS_CLIENT_SECRET: clientSecret,
  GOOGLE_ADS_REFRESH_TOKEN: refreshToken,
  GOOGLE_ADS_DEVELOPER_TOKEN: developerToken,
  GOOGLE_ADS_CUSTOMER_ID: customerId,
  // loginCustomerId is optional — direct access needs no manager.
})) {
  if (!v) {
    console.error(`  Missing ${k} in .env.local. Aborting.`);
    process.exit(1);
  }
}

async function accessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`OAuth token exchange failed (${res.status}): ${t}`);
  return JSON.parse(t).access_token;
}

function headers(token) {
  const h = {
    authorization: `Bearer ${token}`,
    "developer-token": developerToken,
    "content-type": "application/json",
  };
  // Only route through a manager when it actually manages this account.
  if (loginCustomerId && loginCustomerId !== customerId) {
    h["login-customer-id"] = loginCustomerId;
  }
  return h;
}

async function findByName(token, name) {
  const res = await fetch(
    `https://googleads.googleapis.com/${API}/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        query:
          `SELECT conversion_action.resource_name, conversion_action.name, ` +
          `conversion_action.type, conversion_action.status ` +
          `FROM conversion_action WHERE conversion_action.name = '${name}'`,
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Search failed (${res.status}): ${text}`);
  const json = JSON.parse(text);
  const row = (json.results ?? [])[0];
  return row ? row.conversionAction.resourceName : null;
}

async function create(token, name, category) {
  const res = await fetch(
    `https://googleads.googleapis.com/${API}/customers/${customerId}/conversionActions:mutate`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        operations: [
          {
            create: {
              name,
              type: "UPLOAD_CLICKS",
              category,
              status: "ENABLED",
              primaryForGoal: true,
              countingType: "ONE_PER_CLICK",
              valueSettings: {
                defaultValue: 0,
                defaultCurrencyCode: "CAD",
                alwaysUseDefaultValue: false,
              },
            },
          },
        ],
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Create "${name}" failed (${res.status}): ${text}`);
  const json = JSON.parse(text);
  return json.results[0].resourceName;
}

async function ensure(token, name, category, envKey) {
  let rn = await findByName(token, name);
  if (rn) {
    console.log(`  • "${name}" already exists → ${rn}`);
  } else {
    rn = await create(token, name, category);
    console.log(`  • "${name}" CREATED → ${rn}`);
  }
  upsertEnvLocal(envKey, rn);
  return rn;
}

console.log(`\n  Google Ads account ${customerId} (login-customer-id ${loginCustomerId})\n`);
const token = await accessToken();
console.log("  Authenticated. Ensuring conversion actions:\n");

const booked = await ensure(
  token,
  "Booked session",
  "BOOK_APPOINTMENT",
  "GOOGLE_ADS_BOOKED_CONVERSION_ACTION",
);
const signed = await ensure(
  token,
  "Client signed",
  "PURCHASE",
  "GOOGLE_ADS_SIGNED_CONVERSION_ACTION",
);

console.log("\n  Saved to .env.local:");
console.log(`    GOOGLE_ADS_BOOKED_CONVERSION_ACTION=${booked}`);
console.log(`    GOOGLE_ADS_SIGNED_CONVERSION_ACTION=${signed}`);
console.log("\n  Done.\n");
