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

export function generateSyncToken(userId: string, branchId: string, orgId: string, role: string): string {
    return crypto.createHmac('sha256', getSyncSecret())
        .update(`${userId}:${branchId}:${orgId}:${role}`)
        .digest('hex');
}
