import { prisma } from './prisma';
import type { TenantContext } from './tenant-utils';

export const PRIVACY_ENTITY = 'PRIVACY_REQUEST';
export { PRIVACY_STATUSES, privacyStatusLabel } from './privacy-request-labels';
import type { PrivacyStatus } from './privacy-request-labels';
export function privacyRequestView(row: { id: string; userId: string; userName: string; details: string | null; createdAt: Date }) {
    const data = JSON.parse(row.details || '{}');
    return { id: row.id, userId: row.userId, userName: row.userName, createdAt: row.createdAt,
        status: data.status as PrivacyStatus, response: String(data.response || ''), updatedAt: data.updatedAt || row.createdAt,
        organizationId: data.organizationId ?? null };
}
export async function createPrivacyRequest(ctx: TenantContext, clientId: string) {
    return prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`privacy-request:${ctx.user.id}`}))`;
        const id = `${ctx.user.id}.${clientId}`;
        const exact = await tx.auditLog.findUnique({ where: { id } });
        if (exact) {
            if (exact.userId !== ctx.user.id || exact.entity !== PRIVACY_ENTITY || exact.action !== 'REQUEST') throw new Error('معرّف الطلب مستخدم.');
            return privacyRequestView(exact);
        }
        const requests = await tx.auditLog.findMany({ where: { userId: ctx.user.id, entity: PRIVACY_ENTITY, action: 'REQUEST' }, orderBy: { createdAt: 'desc' }, take: 20 });
        const open = requests.find(r => ['REQUESTED', 'IN_REVIEW'].includes(privacyRequestView(r).status));
        if (open) return privacyRequestView(open);
        return privacyRequestView(await tx.auditLog.create({ data: {
            id, userId: ctx.user.id, userName: ctx.user.name || ctx.user.email || 'مستخدم', branchId: ctx.user.branchId ?? null,
            action: 'REQUEST', entity: PRIVACY_ENTITY, entityId: ctx.user.id,
            details: JSON.stringify({ organizationId: ctx.organizationId ?? null, status: 'REQUESTED', scope: 'ACCOUNT_AND_PERSONAL_DATA' }),
        } }));
    });
}
export async function updatePrivacyRequest(ctx: TenantContext, id: string, status: PrivacyStatus, response: string) {
    return prisma.$transaction(async tx => {
        const row = await tx.auditLog.findUnique({ where: { id } });
        if (!row || row.entity !== PRIVACY_ENTITY || row.action !== 'REQUEST') return null;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`privacy-request:${row.userId}`}))`;
        const current = await tx.auditLog.findUniqueOrThrow({ where: { id } });
        const details = JSON.parse(current.details || '{}');
        const next = { ...details, status, response, updatedAt: new Date().toISOString() };
        const updated = await tx.auditLog.update({ where: { id }, data: { details: JSON.stringify(next) } });
        // Preserve every operator decision in a separate immutable audit event.
        await tx.auditLog.create({ data: { userId: ctx.user.id, userName: ctx.user.name || 'مدير المنصة', action: 'UPDATE', entity: PRIVACY_ENTITY, entityId: id,
            details: JSON.stringify({ previousStatus: details.status, status, response }), branchId: row.branchId } });
        return privacyRequestView(updated);
    });
}
