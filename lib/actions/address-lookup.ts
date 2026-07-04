"use server";

/**
 * Address autocomplete via Google Places (New) Autocomplete API. The API
 * key lives server-side (GOOGLE_MAPS_API_KEY) and is never exposed to the
 * browser — the client calls this action, which proxies to Google.
 *
 * Degrades gracefully: with no key configured it returns
 * { ok: true, configured: false } so the UI just behaves like a plain
 * text field. Keeps costs tiny — the caller debounces and requires a few
 * characters before asking.
 */

import { ensureUserProfile } from "@/lib/db/provisioning";

export type AddressSuggestResult =
  | { ok: true; configured: boolean; suggestions: string[] }
  | { ok: false; error: string };

export async function suggestAddresses(
  query: string,
): Promise<AddressSuggestResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: true, configured: false, suggestions: [] };

  const input = (query ?? "").trim();
  if (input.length < 3) {
    return { ok: true, configured: true, suggestions: [] };
  }

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
        },
        body: JSON.stringify({
          input,
          // Bias toward Canada — where Bruce's clients are — without hard
          // filtering, so cross-border addresses still resolve.
          includedRegionCodes: ["ca", "us"],
        }),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      return { ok: false, error: `Lookup failed (${res.status}).` };
    }
    const data = (await res.json()) as {
      suggestions?: {
        placePrediction?: { text?: { text?: string } };
      }[];
    };
    const suggestions = (data.suggestions ?? [])
      .map((s) => s.placePrediction?.text?.text ?? "")
      .filter((t): t is string => t.length > 0)
      .slice(0, 6);
    return { ok: true, configured: true, suggestions };
  } catch (e) {
    return {
      ok: false,
      error: (e instanceof Error ? e.message : "Lookup failed.").slice(0, 160),
    };
  }
}
