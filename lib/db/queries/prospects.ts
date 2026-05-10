/**
 * Prospects queries — Coach Pipeline view. Phase 4.
 *
 * Prospects live in the master org. Coach-side reads run via
 * withSystemContext.
 */

import { desc, eq } from "drizzle-orm";
import { orgs, prospects, type Prospect } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type PipelineProspect = Prospect;

export async function listProspects(): Promise<PipelineProspect[]> {
  return withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [];
    return tx
      .select()
      .from(prospects)
      .where(eq(prospects.orgId, master.id))
      .orderBy(desc(prospects.updatedAt));
  });
}

export async function getProspect(id: string): Promise<Prospect | null> {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select()
      .from(prospects)
      .where(eq(prospects.id, id))
      .limit(1);
    return row ?? null;
  });
}
