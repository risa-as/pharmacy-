import { prisma } from '@/app/lib/prisma';

interface AuditParams {
    userId: string;
    userName: string;
    action: string; // CREATE, UPDATE, DELETE, RETURN, LOGIN, PRICE_CHANGE, etc.
    entity: string; // SALE, INVENTORY, PATIENT, USER, EXPENSE, TRANSFER, SETTINGS, etc.
    entityId?: string;
    details?: string; // JSON string with old/new values or description
    branchId?: string;
    ipAddress?: string;
}

export async function logAudit(params: AuditParams): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                userId: params.userId,
                userName: params.userName,
                action: params.action,
                entity: params.entity,
                entityId: params.entityId ?? null,
                details: params.details ?? null,
                branchId: params.branchId ?? null,
                ipAddress: params.ipAddress ?? null,
            },
        });
    } catch (err) {
        // Audit log failure must never block business operations
        console.error('[AuditLog] Failed to write entry:', err);
    }
}

/**
 * Resolves a user id to a human display name for audit entries. Desktop sync
 * tokens (HMAC) carry no name, so sync routes use this to attribute an action
 * to the real acting user instead of a generic "Desktop Sync".
 */
export async function resolveUserName(userId: string | null | undefined): Promise<string> {
    if (!userId) return 'غير معروف';
    try {
        const u = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true },
        });
        return u?.name ?? u?.email ?? 'غير معروف';
    } catch {
        return 'غير معروف';
    }
}
