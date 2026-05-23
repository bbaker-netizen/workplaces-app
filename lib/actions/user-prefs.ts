"use server";

/**
 * Server actions for per-user UI preferences.
 *
 * Every mutation lands on the caller's own `user_profiles` row, scoped
 * by `clerk_user_id`. RLS is respected (we bind to the caller's tenant)
 * but the WHERE clause also pins to the Clerk user id so a Coach editing
 * their own prefs can't bleed into anyone else's row.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { userProfiles } from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";
import { ensureUserProfile } from "@/lib/db/provisioning";
import type {
  HomeDashboardLayout,
  PipelineColumnPrefs,
} from "@/lib/db/queries/user-prefs";

async function withCaller<T>(
  fn: (orgId: string, clerkUserId: string) => Promise<T>,
): Promise<T | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  // ensureUserProfile gives us orgId; clerkUserId we re-read inside.
  // Simpler: pin by user_profile id which we already have.
  return fn(profile.orgId, profile.userProfileId);
}

/**
 * Toggle a single href in the user's pinned-nav list. Idempotent.
 */
export async function toggleNavPin(href: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof href !== "string" || href.length === 0 || href.length > 200) {
    return { ok: false, error: "Invalid href." };
  }
  try {
    await withCaller(async (orgId, userProfileId) => {
      await withTenantContext(orgId, async (tx) => {
        const [row] = await tx
          .select({ pinned: userProfiles.pinnedNavItems })
          .from(userProfiles)
          .where(eq(userProfiles.id, userProfileId))
          .limit(1);
        if (!row) return;
        const current = row.pinned ?? [];
        const next = current.includes(href)
          ? current.filter((h) => h !== href)
          : [...current, href];
        await tx
          .update(userProfiles)
          .set({ pinnedNavItems: next, updatedAt: new Date() })
          .where(eq(userProfiles.id, userProfileId));
      });
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }
}

/**
 * Persist the user's collapsed-sidebar preference.
 */
export async function setSidebarCollapsed(
  collapsed: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await withCaller(async (orgId, userProfileId) => {
      await withTenantContext(orgId, async (tx) => {
        await tx
          .update(userProfiles)
          .set({ sidebarCollapsed: collapsed, updatedAt: new Date() })
          .where(eq(userProfiles.id, userProfileId));
      });
    });
    // Don't revalidate — toggle is purely visual and we don't want to
    // refetch the whole layout tree on every click.
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }
}

/**
 * Persist the user's pipeline-column preferences (visible columns + widths).
 */
export async function setPipelineColumnPrefs(
  prefs: PipelineColumnPrefs,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!prefs || !Array.isArray(prefs.visible)) {
    return { ok: false, error: "Invalid prefs payload." };
  }
  try {
    await withCaller(async (orgId, userProfileId) => {
      await withTenantContext(orgId, async (tx) => {
        await tx
          .update(userProfiles)
          .set({ pipelineColumnPrefs: prefs, updatedAt: new Date() })
          .where(eq(userProfiles.id, userProfileId));
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }
}

/**
 * Persist the user's email signature. Appended to outbound emails
 * sent from the communications panel.
 */
export async function setEmailSignature(
  signature: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof signature !== "string" || signature.length > 10_000) {
    return { ok: false, error: "Signature too long." };
  }
  try {
    await withCaller(async (orgId, userProfileId) => {
      await withTenantContext(orgId, async (tx) => {
        await tx
          .update(userProfiles)
          .set({
            emailSignature: signature.trim() || null,
            updatedAt: new Date(),
          })
          .where(eq(userProfiles.id, userProfileId));
      });
    });
    revalidatePath("/business-builder/templates");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

/**
 * Persist the user's home-dashboard layout.
 */
export async function setHomeDashboardLayout(
  layout: HomeDashboardLayout,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!layout || !Array.isArray(layout.cards)) {
    return { ok: false, error: "Invalid layout payload." };
  }
  try {
    await withCaller(async (orgId, userProfileId) => {
      await withTenantContext(orgId, async (tx) => {
        await tx
          .update(userProfiles)
          .set({ homeDashboardLayout: layout, updatedAt: new Date() })
          .where(eq(userProfiles.id, userProfileId));
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }
}

// `and` exported for parity with other actions; keep the import live.
void and;
