"use server";

/**
 * The "My clients / All clients" scope toggle.
 *
 * Every Business Builder works in their own book by default and opts
 * into the whole practice's with this toggle. Available to the master
 * admin and to any Business Builder who holds `all_clients_access`;
 * a Builder restricted to an explicit grant list is never offered it,
 * since "all" would hand them the clients they were fenced out of.
 *
 * Persisted in a per-user cookie the cross-client queries read (see
 * `getClientScope` / `coachScopeWhere`).
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  canSeeAllClients,
  clientScopeCookieName,
  type ClientScope,
} from "@/lib/db/queries/business-builder-cross-engagement";

export async function setClientScope(
  scope: ClientScope,
): Promise<{ ok: boolean }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false };
  }
  // Flipping to "mine" is always allowed — it only ever narrows.
  if (scope === "all" && !(await canSeeAllClients())) {
    return { ok: false };
  }
  (await cookies()).set(clientScopeCookieName(profile.userProfileId), scope, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  // Every cross-client surface re-reads on the next render.
  revalidatePath("/business-builder", "layout");
  return { ok: true };
}
