/**
 * Contact directory used by the inbox "Compose new" composer.
 *
 * Returns every send-target the coach could reasonably address from
 * scratch: every prospect (with their contact email) and every active
 * engagement (with the client_lead's email). One row per addressable
 * recipient so the composer dropdown is a simple flat list to
 * search/pick from.
 */

import { asc, eq, notInArray } from "drizzle-orm";
import {
  engagements,
  orgs,
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type ComposeContact = {
  /** Stable id used to pick this contact. Prefixed by kind. */
  key: string;
  kind: "prospect" | "engagement";
  /** Drives sendClientMessage routing. Exactly one is set. */
  prospectId: string | null;
  engagementId: string | null;
  /** Display name — company or person. */
  displayName: string;
  /** The email we'll auto-fill into the To field. */
  email: string;
  /** Secondary line shown in the dropdown ("Prospect", "Client", etc.). */
  context: string;
};

export async function listComposeContacts(): Promise<ComposeContact[]> {
  return withSystemContext(async (tx) => {
    const [prospectRows, engagementRows] = await Promise.all([
      tx
        .select({
          id: prospects.id,
          companyName: prospects.companyName,
          contactName: prospects.contactName,
          contactEmail: prospects.contactEmail,
          status: prospects.status,
        })
        .from(prospects)
        // Drop onboarded/lost prospects — once a deal closes (they
        // become a client) or dies, we usually email them through the
        // engagement record or not at all.
        .where(notInArray(prospects.status, ["onboarded", "lost"]))
        .orderBy(asc(prospects.companyName)),
      // For engagements, pull the client_lead's email so the coach can
      // email the primary contact for any active client.
      tx
        .select({
          engagementId: engagements.id,
          engagementName: engagements.name,
          orgName: orgs.name,
          leadEmail: userProfiles.email,
          leadName: userProfiles.fullName,
        })
        .from(engagements)
        .leftJoin(orgs, eq(orgs.id, engagements.orgId))
        // user_profiles in the same org with role=client_lead. There's
        // exactly one per engagement in practice.
        .leftJoin(
          userProfiles,
          eq(userProfiles.orgId, engagements.orgId),
        )
        .where(eq(userProfiles.role, "client_lead"))
        .orderBy(asc(engagements.name)),
    ]);

    const out: ComposeContact[] = [];

    for (const p of prospectRows) {
      if (!p.contactEmail) continue;
      out.push({
        key: `prospect:${p.id}`,
        kind: "prospect",
        prospectId: p.id,
        engagementId: null,
        displayName: p.contactName
          ? `${p.contactName} (${p.companyName})`
          : p.companyName,
        email: p.contactEmail,
        context: `Prospect · ${p.status.replace(/_/g, " ")}`,
      });
    }

    for (const e of engagementRows) {
      if (!e.leadEmail) continue;
      out.push({
        key: `engagement:${e.engagementId}`,
        kind: "engagement",
        prospectId: null,
        engagementId: e.engagementId,
        displayName: e.leadName
          ? `${e.leadName} (${e.engagementName ?? e.orgName ?? "Client"})`
          : (e.engagementName ?? e.orgName ?? "Client"),
        email: e.leadEmail,
        context: `Client · ${e.engagementName ?? e.orgName ?? ""}`.trim(),
      });
    }

    return out;
  });
}
