import crypto from 'crypto';

const SYNC_SECRET = process.env.SYNC_TOKEN_SECRET || 'faramace-sync-secret-key';

export function generateSyncToken(userId: string, branchId: string, orgId: string, role: string): string {
    return crypto.createHmac('sha256', SYNC_SECRET)
        .update(`${userId}:${branchId}:${orgId}:${role}`)
        .digest('hex');
}
