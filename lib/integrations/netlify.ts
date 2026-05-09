/**
 * Netlify API wrapper.
 *
 * Phase 2.12. Used by the Embedded Apps module to populate the
 * project picker from Bruce's Netlify account. Single read-only
 * surface for now; production deployment + monitoring isn't a
 * concern for this app.
 *
 * Auth: `NETLIFY_PERSONAL_ACCESS_TOKEN` from
 * https://app.netlify.com/user/applications#personal-access-tokens.
 */

const API_BASE = "https://api.netlify.com/api/v1";

export type NetlifyProject = {
  id: string;
  name: string;
  url: string;
  sslUrl: string;
  customDomain: string | null;
  state: string;
  updatedAt: string;
};

function token(): string {
  const t = process.env.NETLIFY_PERSONAL_ACCESS_TOKEN;
  if (!t) {
    throw new Error(
      "NETLIFY_PERSONAL_ACCESS_TOKEN not configured. Get a token at https://app.netlify.com/user/applications#personal-access-tokens",
    );
  }
  return t;
}

/**
 * List every Netlify site (project) in the authenticated account.
 * Paginates internally. Capped at 200 — anything more would benefit
 * from server-side filtering.
 */
export async function listNetlifySites(): Promise<NetlifyProject[]> {
  const sites: NetlifyProject[] = [];
  let page = 1;
  while (sites.length < 200) {
    const url = `${API_BASE}/sites?per_page=50&page=${page}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    });
    if (!resp.ok) {
      throw new Error(
        `Netlify API failed (${resp.status}): ${await resp.text()}`,
      );
    }
    const batch = (await resp.json()) as Array<{
      id: string;
      name: string;
      url: string;
      ssl_url: string;
      custom_domain: string | null;
      state: string;
      updated_at: string;
    }>;
    if (batch.length === 0) break;
    for (const s of batch) {
      sites.push({
        id: s.id,
        name: s.name,
        url: s.url,
        sslUrl: s.ssl_url,
        customDomain: s.custom_domain,
        state: s.state,
        updatedAt: s.updated_at,
      });
    }
    if (batch.length < 50) break;
    page += 1;
  }
  return sites;
}
