/**
 * Merged into the Business Builder guide — the module reference is now a
 * section there, not a separate page. Bounce any stale link/bookmark.
 */

import { redirect } from "next/navigation";

export default function RetiredModulesGuide() {
  redirect("/business-builder/welcome#module-reference");
}
