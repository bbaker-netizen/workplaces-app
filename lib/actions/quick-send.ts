"use server";

/**
 * Stand-alone "quick send" tools any Business Builder can use:
 *   - send the diagnostic link to someone
 *   - ask a client for a Google review
 * Sends by email (Resend) and/or SMS (Twilio). Not tied to a prospect record.
 */

import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { sendEmail } from "@/lib/email/send";
import { isSmsConfigured, sendSms } from "@/lib/integrations/twilio";

// Bruce's Google Business review link. Change here (or lift to an env var)
// if the review destination ever moves.
const REVIEW_URL =
  process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL ??
  "https://g.page/r/CepaVNuDzHD_EBE/review";

function appBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://builder.4workplaces.com"
  ).replace(/\/+$/, "");
}

const schema = z.object({
  name: z.string().max(120).nullable().optional(),
  email: z
    .string()
    .email()
    .nullable()
    .optional()
    .or(z.literal("")),
  phone: z.string().max(30).nullable().optional(),
  channel: z.enum(["email", "sms", "both"]),
  message: z.string().max(1000).nullable().optional(),
});

type Input = z.input<typeof schema>;
type Result =
  | { ok: true; sentEmail: boolean; sentSms: boolean }
  | { ok: false; error: string };

const phoneRe = /^\+?[0-9()\-\s]{7,20}$/;

function emailShell(heading: string, body: string, buttonLabel: string, url: string): string {
  return `<div style="background:#F5F1E8;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E8E2D4;border-radius:12px;padding:28px">
      <h1 style="font-size:20px;margin:0 0 12px;color:#14385B">${heading}</h1>
      <div style="font-size:15px;line-height:1.55;color:#2A323B">${body}</div>
      <p style="margin:22px 0 6px">
        <a href="${url}" style="display:inline-block;background:#2C6CB0;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:9999px">${buttonLabel}</a>
      </p>
      <p style="font-size:12px;color:#8A8A8A;margin-top:18px">Or paste this link into your browser:<br>${url}</p>
    </div>
  </div>`;
}

async function run(
  input: Input,
  kind: "diagnostic" | "review",
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { name, email, phone, channel, message } = parsed.data;
  const first = (name ?? "").trim().split(/\s+/)[0] || "there";

  const wantEmail = channel === "email" || channel === "both";
  const wantSms = channel === "sms" || channel === "both";

  if (wantEmail && !(email && email.trim())) {
    return { ok: false, error: "Add an email address for an email send." };
  }
  if (wantSms && !(phone && phoneRe.test(phone.trim()))) {
    return { ok: false, error: "Add a valid phone number for a text send." };
  }
  if (wantSms && !isSmsConfigured()) {
    return { ok: false, error: "Texting isn't set up on your account yet." };
  }

  const url = kind === "diagnostic" ? `${appBase()}/diagnostic` : REVIEW_URL;
  const extra = message && message.trim() ? `<p>${message.trim()}</p>` : "";

  const email_ =
    kind === "diagnostic"
      ? {
          subject: "A quick business diagnostic from Workplaces",
          html: emailShell(
            `Hi ${first},`,
            `<p>Here's a short business diagnostic — it takes about 5 minutes and gives us a clear picture to work from.</p>${extra}`,
            "Start the diagnostic",
            url,
          ),
          text: `Hi ${first}, here's a quick business diagnostic from Workplaces: ${url}`,
        }
      : {
          subject: "Would you leave us a quick Google review?",
          html: emailShell(
            `Hi ${first},`,
            `<p>Thanks for working with us! If you have a moment, a quick Google review would mean a lot and helps other business owners find us.</p>${extra}`,
            "Leave a Google review",
            url,
          ),
          text: `Hi ${first}, thanks for working with us! Would you mind leaving a quick Google review? ${url}`,
        };

  const smsBody =
    kind === "diagnostic"
      ? `Hi ${first}, here's a quick business diagnostic from Workplaces: ${url}`
      : `Hi ${first}, thanks for working with us! Would you mind leaving a quick Google review? ${url}`;

  let sentEmail = false;
  let sentSms = false;
  const errors: string[] = [];

  if (wantEmail && email) {
    const r = await sendEmail({
      to: email.trim(),
      subject: email_.subject,
      html: email_.html,
      text: email_.text,
      bypassWorkingHours: true,
    });
    if (r.delivered) sentEmail = true;
    else errors.push(`Email: ${r.reason === "outside_working_hours" ? "queued outside working hours" : r.error ?? r.reason}`);
  }
  if (wantSms && phone) {
    try {
      await sendSms({ to: phone.trim(), body: smsBody });
      sentSms = true;
    } catch (e) {
      errors.push(`SMS: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  if (!sentEmail && !sentSms) {
    return { ok: false, error: errors.join(" · ") || "Nothing sent." };
  }
  return { ok: true, sentEmail, sentSms };
}

export async function sendDiagnosticInvite(input: Input): Promise<Result> {
  return run(input, "diagnostic");
}

export async function sendReviewRequest(input: Input): Promise<Result> {
  return run(input, "review");
}
