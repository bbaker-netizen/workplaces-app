import { redirect } from "next/navigation";

/**
 * The per-Business-Builder client + module controls now live directly on
 * the Business Builders team page (under each teammate). This route is
 * kept only to redirect any old links there.
 */
export default function BbAccessRedirect() {
  redirect("/business-builder/settings/team");
}
