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
