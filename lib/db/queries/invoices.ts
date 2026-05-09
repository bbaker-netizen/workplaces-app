import { desc, eq } from "drizzle-orm";
import { invoices, type Invoice } from "../schema";
import { withEngagementContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export async function listEngagementInvoices(
  engagementId: string,
): Promise<Invoice[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) =>
        tx
          .select()
          .from(invoices)
          .where(eq(invoices.engagementId, engagementId))
          .orderBy(desc(invoices.issuedAt)),
    );
  } catch {
    return [];
  }
}
