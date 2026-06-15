"use server";

/**
 * Business-card scanner. Takes a photo (data URL) of a business card,
 * runs it through Claude vision, and returns the contact details so the
 * new-lead form can prefill itself. Built for adding leads on a phone at
 * a networking event — snap the card, review, save.
 *
 * Nothing is persisted here; extraction only. The coach always reviews
 * the prefilled fields before the prospect is created.
 */

import { ensureUserProfile } from "@/lib/db/provisioning";
import { completeWithImage, type ImageInput } from "@/lib/ai/anthropic";

export type ScannedCard = {
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  phone?: string;
  companyWebsite?: string;
  linkedinUrl?: string;
};

export type ScanCardResult =
  | { ok: true; data: ScannedCard }
  | { ok: false; error: string };

// Anthropic caps inline images; keep well under it. Base64 inflates ~33%.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const SYSTEM = `You read contact details off a photo of a business card.
Return ONLY a compact JSON object — no prose, no markdown fences — with any
of these keys that appear on the card: companyName, contactName,
contactEmail, phone, companyWebsite, linkedinUrl.

Rules:
- contactName is the person's full name (not their job title).
- companyName is the business/organization name.
- Use the primary email and primary phone if several are listed.
- companyWebsite and linkedinUrl should be full URLs when present.
- Omit a key entirely if that detail isn't on the card. Never guess or
  invent a value. If the image isn't a business card, return {}.`;

export async function scanBusinessCard(
  dataUrl: string,
): Promise<ScanCardResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "You're not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Only Business Builders can scan cards." };
  }

  const match = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/i.exec(
    dataUrl.trim(),
  );
  if (!match) {
    return { ok: false, error: "That doesn't look like a photo. Try again." };
  }
  const rawType = match[1].toLowerCase();
  const mediaType = (rawType === "image/jpg" ? "image/jpeg" : rawType) as
    ImageInput["mediaType"];
  const base64 = match[2];
  if ((base64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return { ok: false, error: "That photo's too large — try a smaller one." };
  }

  try {
    const res = await completeWithImage({
      system: SYSTEM,
      user: "Extract the contact details from this business card.",
      image: { base64, mediaType },
      maxTokens: 512,
    });
    const data = parseScanned(res.text);
    if (!data) {
      return {
        ok: false,
        error: "Couldn't read that card. Try a clearer, well-lit photo.",
      };
    }
    if (Object.keys(data).length === 0) {
      return {
        ok: false,
        error: "No contact details found — is the card in frame and in focus?",
      };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Pull a clean ScannedCard out of the model's reply (tolerates fences). */
function parseScanned(text: string): ScannedCard | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  const pick = (k: string): string | undefined => {
    const v = obj[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return {
    companyName: pick("companyName"),
    contactName: pick("contactName"),
    contactEmail: pick("contactEmail"),
    phone: pick("phone"),
    companyWebsite: pick("companyWebsite"),
    linkedinUrl: pick("linkedinUrl"),
  };
}
