"use server";

/**
 * Master-admin "My clients / All clients" scope toggle. Persists the choice in
 * a cookie the coach cross-client queries read (see coachScopeWhere). Only the
 * master admin can flip it; standard Business Builders are always scoped to
 * their own clients.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  CLIENT_SCOPE_COOKIE,
  type ClientScope,
} from "@/lib/db/queries/business-builder-cross-engagement";

export async function setClientScope(
  scope: ClientScope,
): Promise<{ ok: boolean }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok" || profile.role !== "master_admin") {
    return { ok: false };
  }
  (await cookies()).set(CLIENT_SCOPE_COOKIE, scope, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  // Every coach cross-client surface re-reads on the next render.
  revalidatePath("/business-builder", "layout");
  return { ok: true };
}
