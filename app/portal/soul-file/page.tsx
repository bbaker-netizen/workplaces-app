/**
 * /portal/soul-file — retired.
 *
 * The Soul File is coach-only context and is no longer a client portal
 * module. Any stale link or bookmark here bounces back to the portal
 * dashboard. Coaches manage the Soul File at /business-builder/soul-file.
 */

import { redirect } from "next/navigation";

export default function RetiredPortalSoulFile() {
  redirect("/portal");
}
