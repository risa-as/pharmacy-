import crypto from 'crypto';

function getSyncSecret(): string {
    const secret = process.env.SYNC_TOKEN_SECRET;
    if (!secret) {
        // Fail loudly: a hardcoded fallback would let anyone forge sync tokens
        // for any user/role/org (full auth bypass across tenants).
        throw new Error('SYNC_TOKEN_SECRET env var is not set — refusing to issue sync tokens');
    }
    return secret;
}

/**
 * Message signed by a desktop sync token. Version 0 keeps the original format,
 * so every token issued before sessionVersion existed still verifies as
 * version 0; later versions sign the version too (sent as x-session-version).
 */
export function syncTokenMessage(userId: string, branchId: string, orgId: string, role: string, sessionVersion = 0): string {
    const base = `${userId}:${branchId}:${orgId}:${role}`;
    return sessionVersion > 0 ? `${base}:v${sessionVersion}` : base;
}

export function generateSyncToken(userId: string, branchId: string, orgId: string, role: string, sessionVersion = 0): string {
    return crypto.createHmac('sha256', getSyncSecret())
        .update(syncTokenMessage(userId, branchId, orgId, role, sessionVersion))
        .digest('hex');
}
