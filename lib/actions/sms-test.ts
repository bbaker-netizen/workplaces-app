"use server";

/**
 * Send a test SMS so a Business Builder can confirm texting works, without
 * having to message a real prospect. Any Business Builder can run it.
 */

import { ensureUserProfile } from "@/lib/db/provisioning";
import { isSmsConfigured, sendSms } from "@/lib/integrations/twilio";

const phoneRe = /^\+?[0-9()\-\s]{7,20}$/;

export async function sendTestSms(
  toPhone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  if (!isSmsConfigured()) {
    return {
      ok: false,
      error:
        "SMS isn't set up yet — your account admin configures texting (Twilio) once for everyone.",
    };
  }
  const to = (toPhone ?? "").trim();
  if (!phoneRe.test(to)) {
    return {
      ok: false,
      error: "Enter a valid phone number, e.g. +1 780 555 1234.",
    };
  }
  try {
    await sendSms({
      to,
      body: "✅ Test from The Builder — your SMS is working.",
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: (e instanceof Error ? e.message : "Send failed.").slice(0, 200),
    };
  }
}
