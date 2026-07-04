/**
 * Marketing-list read queries. Business Builder side; master org only.
 */

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { marketingContacts, orgs, type MarketingContact } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type MarketingListPage = {
  contacts: MarketingContact[];
  total: number;
};

/** List marketing contacts, newest first, with an optional search term over
 *  name / email / company. Caps at 500 rows for the page render. */
export async function listMarketingContacts(
  q?: string,
): Promise<MarketingListPage> {
  return withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return { contacts: [], total: 0 };

    const term = q?.trim() ? `%${q.trim()}%` : null;
    const where = term
      ? and(
          eq(marketingContacts.orgId, master.id),
          or(
            ilike(marketingContacts.name, term),
            ilike(marketingContacts.email, term),
            ilike(marketingContacts.company, term),
          ),
        )
      : eq(marketingContacts.orgId, master.id);

    const [contacts, totalRows] = await Promise.all([
      tx
        .select()
        .from(marketingContacts)
        .where(where)
        .orderBy(desc(marketingContacts.createdAt))
        .limit(500),
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(marketingContacts)
        .where(eq(marketingContacts.orgId, master.id)),
    ]);

    return { contacts, total: totalRows[0]?.n ?? 0 };
  });
}
