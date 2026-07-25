/**
 * EA approval tokens — the mechanism behind every approve link in every
 * EA email.
 *
 * Design, and why:
 *
 *   - **No login.** An approval that requires sitting at a desk does not
 *     happen, and an unapproved recap ages badly. The token IS the
 *     authorization, so Bruce can approve a block or a recap from his
 *     phone, from the email, in five seconds.
 *
 *   - **Hashed at rest.** We store SHA-256 of the token, never the token
 *     itself. The row is a verifier, not a copy of the secret: read
 *     access to the database alone does not let someone approve on
 *     Bruce's behalf. Same reasoning as password storage.
 *
 *   - **Single use.** `consumed_at` is set inside the same transaction
 *     that resolves the token, so two taps on the same link (or a link
 *     prefetched by a mail client and then tapped) cannot place two
 *     calendar events or send two recaps.
 *
 *   - **72-hour expiry.** Long enough to survive a weekend, short enough
 *     that a forwarded email stops working before it becomes a problem.
 *
 * Resolution runs under `withSystemContext` because the public approve
 * route has no signed-in user and therefore no org GUC to bind to. The
 * token is the credential; the row carries the org id we then act with.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { eaApprovalTokens } from "@/lib/db/schema";
import { withSystemContext, type Tx } from "@/lib/db/tenant";

/** How long an approve link stays live. */
export const TOKEN_TTL_HOURS = 72;

export type ApprovalSubjectType =
  | "time_block"
  | "session_recap"
  | "agenda_proposal";

/** SHA-256, hex. Deterministic — the lookup key for a presented token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Mint a token for `subject`, inside the caller's transaction so the
 * token and the thing it approves are written atomically.
 *
 * Returns the PLAINTEXT token — the only moment it exists in the clear.
 * Put it straight into the URL; it is never persisted.
 */
export async function mintApprovalToken(
  tx: Tx,
  args: {
    orgId: string;
    userProfileId: string;
    subjectType: ApprovalSubjectType;
    subjectId: string;
    /** Override the default TTL. Used by tests; production uses 72h. */
    ttlHours?: number;
  },
): Promise<string> {
  // 32 bytes of entropy. base64url so it survives a URL path segment
  // without escaping, and survives a mail client's link rewriter.
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + (args.ttlHours ?? TOKEN_TTL_HOURS) * 60 * 60 * 1000,
  );

  await tx.insert(eaApprovalTokens).values({
    orgId: args.orgId,
    tokenHash: hashToken(token),
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    userProfileId: args.userProfileId,
    expiresAt,
  });

  return token;
}

export type ResolvedToken = {
  id: string;
  orgId: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  userProfileId: string;
};

export type TokenResolution =
  | { ok: true; token: ResolvedToken }
  | { ok: false; reason: "not_found" | "expired" | "already_used" };

/**
 * Resolve and CONSUME a token in one atomic step.
 *
 * The consume is an UPDATE guarded by `consumed_at IS NULL` and matched
 * on the hash. Postgres serialises the row, so a double-tap loses the
 * race and comes back `already_used` rather than performing the action
 * twice. Doing the check-then-write as two statements would leave that
 * window open, which for a calendar block means two events and for a
 * recap means the client receives it twice.
 *
 * `withSystemContext` is deliberate: the public route has no session, so
 * there is no org GUC to bind. The presented token is the credential.
 */
export async function consumeApprovalToken(
  presented: string,
): Promise<TokenResolution> {
  if (!presented || presented.length < 16) return { ok: false, reason: "not_found" };
  const hash = hashToken(presented);

  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        id: eaApprovalTokens.id,
        orgId: eaApprovalTokens.orgId,
        subjectType: eaApprovalTokens.subjectType,
        subjectId: eaApprovalTokens.subjectId,
        userProfileId: eaApprovalTokens.userProfileId,
        expiresAt: eaApprovalTokens.expiresAt,
        consumedAt: eaApprovalTokens.consumedAt,
        tokenHash: eaApprovalTokens.tokenHash,
      })
      .from(eaApprovalTokens)
      .where(eq(eaApprovalTokens.tokenHash, hash))
      .limit(1);

    if (!row) return { ok: false, reason: "not_found" as const };

    // Constant-time compare on the hash. The lookup above already
    // matched it, so this is belt-and-braces against a future refactor
    // that switches to a prefix lookup.
    const a = Buffer.from(row.tokenHash, "utf8");
    const b = Buffer.from(hash, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "not_found" as const };
    }

    if (row.consumedAt) return { ok: false, reason: "already_used" as const };
    if (row.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: "expired" as const };
    }

    // Atomic claim. If a concurrent request got here first, `consumed_at`
    // is no longer null and this updates zero rows.
    const claimed = await tx
      .update(eaApprovalTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(eaApprovalTokens.id, row.id),
          isNull(eaApprovalTokens.consumedAt),
        ),
      )
      .returning({ id: eaApprovalTokens.id });

    if (claimed.length === 0) {
      return { ok: false, reason: "already_used" as const };
    }

    return {
      ok: true as const,
      token: {
        id: row.id,
        orgId: row.orgId,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        userProfileId: row.userProfileId,
      },
    };
  });
}

/**
 * Look at a token WITHOUT consuming it.
 *
 * This exists because mail security scanners (Outlook Safe Links, Gmail
 * link checkers, corporate proxies) fetch the URLs in a message before a
 * human ever sees it. If a GET performed the approval, a scanner would
 * burn the single-use token — and for a session recap it would email a
 * client on Bruce's behalf without him having clicked anything, which
 * violates the rule that nothing goes out under his name unapproved.
 *
 * So the approve link is a two-step: GET peeks and renders "here is what
 * this will do", POST consumes and acts. Still no login, still approvable
 * from a phone in seconds, but a prefetch cannot fire it.
 */
export async function peekApprovalToken(
  presented: string,
): Promise<TokenResolution> {
  if (!presented || presented.length < 16) return { ok: false, reason: "not_found" };
  const hash = hashToken(presented);

  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        id: eaApprovalTokens.id,
        orgId: eaApprovalTokens.orgId,
        subjectType: eaApprovalTokens.subjectType,
        subjectId: eaApprovalTokens.subjectId,
        userProfileId: eaApprovalTokens.userProfileId,
        expiresAt: eaApprovalTokens.expiresAt,
        consumedAt: eaApprovalTokens.consumedAt,
      })
      .from(eaApprovalTokens)
      .where(eq(eaApprovalTokens.tokenHash, hash))
      .limit(1);

    if (!row) return { ok: false, reason: "not_found" as const };
    if (row.consumedAt) return { ok: false, reason: "already_used" as const };
    if (row.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: "expired" as const };
    }
    return {
      ok: true as const,
      token: {
        id: row.id,
        orgId: row.orgId,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        userProfileId: row.userProfileId,
      },
    };
  });
}

/** Absolute URL for an approve link. */
export function approvalUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  return `${base}/api/ea/approve/${encodeURIComponent(token)}`;
}
