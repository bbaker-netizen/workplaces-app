/**
 * Append-only audit-log helpers for signature envelopes.
 *
 * Each entry is a small JSON object stored in the envelope's
 * `audit_log` JSONB column. The certificate-of-completion page renders
 * this verbatim into the signed PDF so the trail is permanent.
 */

export type AuditEntry = {
  at: string; // ISO timestamp
  event: string;
  signerEmail?: string | null;
  ip?: string | null;
  by?: string | null;
};

export function makeAuditEntry(
  event: string,
  extras: Omit<AuditEntry, "at" | "event"> = {},
): AuditEntry {
  return {
    at: new Date().toISOString(),
    event,
    ...extras,
  };
}
