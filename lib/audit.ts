/**
 * Audit log helper.
 *
 * Phase 2.9. Single entry point for writing to `audit_log`. Used
 * pervasively across server actions to record state changes.
 *
 * The helper opens its own tenant transaction (via withEngagement
 * Context where possible), so callers don't have to worry about
 * binding the right org GUC when their audit emit is on a slightly
 * different scope from their main work.
 */

import { auditLog } from "@/lib/db/schema";
import { withEngagementContext } from "@/lib/db/tenant";

export type AuditEventType =
  | "create"
  | "update"
  | "delete"
  | "publish"
  | "transfer"
  | "login"
  | "permission_change"
  | "ai_generation"
  | "webhook_received";

export type AuditInput = {
  callerOrgId: string;
  callerRole: string;
  engagementId: string;
  actorUserProfileId: string | null;
  eventType: AuditEventType;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

/**
 * Write a single audit row. Best-effort — failures log to stderr and
 * don't propagate. Audit must never block the primary action.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await withEngagementContext(
      input.callerOrgId,
      input.callerRole,
      input.engagementId,
      async (tx, boundOrgId) => {
        await tx.insert(auditLog).values({
          orgId: boundOrgId,
          actorUserProfileId: input.actorUserProfileId,
          eventType: input.eventType,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          summary: input.summary,
          metadata: input.metadata ?? {},
        });
      },
    );
  } catch (e) {
    console.error("[audit] write failed:", e);
  }
}
