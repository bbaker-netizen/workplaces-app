/**
 * Engagement lifecycle helpers shared by the portal layout and the
 * client-facing write actions.
 *
 * A client portal is READ-ONLY whenever its engagement is `paused` or
 * `completed`. Clients can still view everything; they just can't post,
 * edit, or upload until the Business Builder reactivates the engagement.
 */

export type EngagementStatusLike = string | null | undefined;

/** True when the engagement is in a state that freezes client writes. */
export function isEngagementReadOnly(status: EngagementStatusLike): boolean {
  return status === "paused" || status === "completed";
}

/** Short human label for the read-only banner. */
export function readOnlyReason(status: EngagementStatusLike): string {
  if (status === "completed") return "completed";
  return "paused";
}
