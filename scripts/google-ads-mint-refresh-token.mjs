/**
 * One-time helper: mint a long-lived Google Ads API refresh token.
 *
 * Runs the OAuth "installed app" (Desktop) loopback flow entirely on your
 * machine: starts a tiny localhost server, opens Google's consent page, catches
 * the redirect, exchanges the code for tokens, and prints the refresh token.
 * The client secret and refresh token never leave this computer.
 *
 * Prereqs — add these two lines to .env.local (git-ignored) first:
 *   GOOGLE_ADS_CLIENT_ID=...apps.googleusercontent.com
 *   GOOGLE_ADS_CLIENT_SECRET=...
 * The OAuth client MUST be of type "Desktop app" (loopback redirect).
 *
 * Run:  node scripts/google-ads-mint-refresh-token.mjs
 *
 * Then copy the printed refresh token into .env.local as
 *   GOOGLE_ADS_REFRESH_TOKEN=...
 * and into the Netlify dashboard. Do NOT paste it into any chat.
 */

import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { resolve } from "node:path";

// --- Load .env.local the same way the other repo scripts do -----------------
const envPath = resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

/** Insert or replace a KEY=value line in .env.local without disturbing the
 *  rest of the file. Creates the file if it somehow doesn't exist. */
function upsertEnvLocal(key, value) {
  const line = `${key}=${value}`;
  let contents = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(contents)) {
    contents = contents.replace(re, line);
  } else {
    if (contents.length && !contents.endsWith("\n")) contents += "\n";
    contents += line + "\n";
  }
  fs.writeFileSync(envPath, contents);
}

const clientId = (process.env.GOOGLE_ADS_CLIENT_ID ?? "").trim();
const clientSecret = (process.env.GOOGLE_ADS_CLIENT_SECRET ?? "").trim();

if (!clientId || !clientSecret) {
  console.error(
    "\n  Missing GOOGLE_ADS_CLIENT_ID and/or GOOGLE_ADS_CLIENT_SECRET.\n" +
      "  Add both to .env.local (see the header of this file), then re-run.\n",
  );
  process.exit(1);
}

// Loopback redirect. Desktop-type clients may use any 127.0.0.1 port with no
// pre-registration. Override the port with PORT=xxxx if 4785 is busy.
const PORT = Number(process.env.PORT ?? 4785);
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;
// datamanager = offline-conversion uploads (the live feature). adwords = managing
// conversion actions (already done, kept for completeness). Requesting both means
// one token covers everything.
const SCOPE =
  "https://www.googleapis.com/auth/datamanager https://www.googleapis.com/auth/adwords";
const state = crypto.randomBytes(16).toString("hex");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // force a refresh token even on a repeat authorization
    state,
  }).toString();

function openBrowser(url) {
  // Best-effort; the URL is also printed so the user can open it manually.
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" });
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    }
  } catch {
    /* ignore — manual open works */
  }
}

async function exchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

function replyHtml(res, title, message) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<body style="font-family:system-ui;background:#F5F1E8;color:#1A1A1A;` +
      `display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
      `<div style="max-width:32rem;padding:2rem;text-align:center">` +
      `<h1 style="color:#2E4057">${title}</h1><p>${message}</p></div></body>`,
  );
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404).end("Not found");
    return;
  }

  const err = url.searchParams.get("error");
  if (err) {
    replyHtml(res, "Authorization denied", `Google returned: ${err}. You can close this tab.`);
    console.error(`\n  Authorization was denied: ${err}\n`);
    server.close();
    process.exit(1);
  }

  if (url.searchParams.get("state") !== state) {
    replyHtml(res, "State mismatch", "Possible CSRF — re-run the script.");
    console.error("\n  State parameter mismatch — aborting for safety.\n");
    server.close();
    process.exit(1);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    replyHtml(res, "No code", "No authorization code received. Re-run the script.");
    server.close();
    process.exit(1);
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      replyHtml(
        res,
        "No refresh token",
        "Google did not return a refresh token. Revoke prior access at " +
          "https://myaccount.google.com/permissions and re-run.",
      );
      console.error(
        "\n  No refresh_token in the response. This usually means you've " +
          "authorized this app before.\n  Remove it at " +
          "https://myaccount.google.com/permissions then re-run.\n",
      );
      server.close();
      process.exit(1);
    }

    // Write the token straight into .env.local (upsert). It is never printed
    // to stdout, so it stays out of any terminal capture / chat context.
    upsertEnvLocal("GOOGLE_ADS_REFRESH_TOKEN", tokens.refresh_token);

    replyHtml(
      res,
      "Refresh token minted",
      "All set. The token was saved into your local .env.local file. You can close this tab.",
    );

    const masked =
      tokens.refresh_token.slice(0, 6) + "…" + tokens.refresh_token.slice(-4);
    console.log("\n============================================================");
    console.log("  SUCCESS. Refresh token minted and written to .env.local as");
    console.log(`  GOOGLE_ADS_REFRESH_TOKEN (value hidden: ${masked}, ` +
      `${tokens.refresh_token.length} chars).`);
    console.log("  Nothing secret was printed. You're done with this step.");
    console.log("============================================================\n");

    server.close();
    process.exit(0);
  } catch (e) {
    replyHtml(res, "Exchange failed", "See the terminal for details.");
    console.error("\n  " + (e instanceof Error ? e.message : String(e)) + "\n");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("\n  Opening Google's consent screen in your browser…");
  console.log("  If it doesn't open, paste this URL in manually:\n");
  console.log("  " + authUrl + "\n");
  console.log(`  (waiting for the redirect to ${REDIRECT_URI} …)\n`);
  openBrowser(authUrl);
});

server.on("error", (e) => {
  if (e && e.code === "EADDRINUSE") {
    console.error(
      `\n  Port ${PORT} is in use. Re-run with a different port, e.g.:\n` +
        `    PORT=4786 node scripts/google-ads-mint-refresh-token.mjs\n` +
        `  (PowerShell: $env:PORT=4786; node scripts/google-ads-mint-refresh-token.mjs)\n`,
    );
  } else {
    console.error("\n  Server error: " + (e?.message ?? String(e)) + "\n");
  }
  process.exit(1);
});
