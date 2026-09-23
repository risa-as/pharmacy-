import type { JWT } from 'next-auth/jwt';
import { getSubscriptionState } from './subscription-state';

type UserLookup = (id: string) => Promise<{
    role: string;
    isActive: boolean;
    branchId: string | null;
    permissions: string | null;
    warehouseId: string | null;
    sessionVersion: number;
    branch: {
        organizationId: string;
        organization?: { subscriptionEndsAt: Date | null; isSuspended: boolean } | null;
    } | null;
} | null>;

/** Session marker set when the user could not be re-read (database unavailable). */
export const SESSION_REFRESH_UNAVAILABLE = 'SESSION_REFRESH_UNAVAILABLE';

/** Thrown by tenant/warehouse context helpers when the session could not be verified. */
export class SessionUnavailableError extends Error {
    constructor() { super('Session verification temporarily unavailable'); }
}

/**
 * Re-reads the signed-in user on every session read so role, scope and
 * permission changes, account disabling, and session revocation reach every
 * `auth()` caller before the cookie expires.
 *
 * - User missing, disabled, or sessionVersion moved past the token's: returns
 *   null, and Auth.js drops the cookie (a proven state change).
 * - Lookup failure (database unavailable): keeps the cookie but marks the
 *   token `refreshFailed`; the session callback then exposes no user, so no
 *   request proceeds on stale claims and a transient outage is not a mass logout.
 *
 * Runs only in the Node runtime (auth.ts); auth.config.ts stays Prisma-free
 * because middleware runs on the edge.
 */
export async function refreshSessionToken(token: JWT, findUser: UserLookup): Promise<JWT | null> {
    const id = token.id as string | undefined;
    if (!id) return null;
    let user;
    try {
        user = await findUser(id);
    } catch {
        token.refreshFailed = true;
        return token;
    }
    if (!user || !user.isActive) return null;
    // Tokens issued before sessionVersion existed carry none: treated as version 0.
    if ((Number(token.sessionVersion) || 0) !== user.sessionVersion) return null;
    delete token.refreshFailed;
    token.role = user.role;
    token.branchId = user.branchId;
    token.organizationId = user.branch?.organizationId ?? null;
    token.permissions = user.permissions ?? null;
    token.warehouseId = user.warehouseId ?? null;
    // Subscription state follows the organisation now, not the sign-in moment
    // (N10), so a suspension or renewal reaches the session without a new login.
    // No branch (warehouse or super admin) has nothing to gate on; a lookup that
    // did not load the organisation leaves the previous value untouched.
    const org = user.branch?.organization;
    if (org) token.subscriptionState = getSubscriptionState(org).state;
    else if (!user.branch) token.subscriptionState = 'active';
    return token;
}
