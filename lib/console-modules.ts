/**
 * Canonical list of Business Builder console modules that a master_admin
 * can grant/revoke per Business Builder. Keyed by the nav href so the
 * sidebar can filter against `user_profiles.allowed_console_modules`.
 *
 * "My work" (/business-builder) is the home and is always available;
 * "Settings" is already master-admin-only, so neither is listed here.
 */
export type ConsoleModule = { href: string; label: string };

export const CONSOLE_MODULES: ConsoleModule[] = [
  { href: "/business-builder/pipeline", label: "Prospects & Clients" },
  { href: "/business-builder/engagements", label: "Client Portal" },
  { href: "/business-builder/calendar", label: "Calendar" },
  { href: "/business-builder/action-items", label: "Action items" },
  { href: "/business-builder/inbox", label: "Inbox (email / SMS / calls)" },
  { href: "/business-builder/communication", label: "Communication" },
  { href: "/business-builder/deliverables", label: "Deliverables" },
  { href: "/business-builder/projects", label: "Projects" },
  { href: "/business-builder/templates", label: "Templates & signatures" },
  { href: "/business-builder/library", label: "Client tools & tutorials" },
];

const GATEABLE = new Set(CONSOLE_MODULES.map((m) => m.href));

/**
 * Whether a given console nav href is visible, given a user's allowed set.
 * `allowed === null` (the default) means everything is visible. Non-gateable
 * hrefs (home, settings, guide) are always visible — only the modules in
 * CONSOLE_MODULES can be restricted.
 */
export function isConsoleModuleVisible(
  href: string,
  allowed: string[] | null,
): boolean {
  if (allowed === null) return true;
  if (!GATEABLE.has(href)) return true;
  return allowed.includes(href);
}
