import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { warehouseOrderScope, type WarehouseScopeInput } from './warehouse-access';

// WarehouseReturn has no Prisma relation to its order; join it explicitly so
// branch ownership is checked before filtering or paginating returns.
export async function listPharmacyReturns(identity: WarehouseScopeInput, params: URLSearchParams) {
    if (!warehouseOrderScope(identity)) throw new Error('Forbidden');
    const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page'))) || 1));
    const status = params.get('returnStatus') || '';
    if (status && !['PENDING', 'ACCEPTED', 'REJECTED'].includes(status)) throw new Error('INVALID_STATUS');
    const search = (params.get('search') || '').trim().slice(0, 150);
    const branchId = params.get('branchId');
    const scope = identity.role === 'SUPER_ADMIN' ? Prisma.sql`TRUE`
        : ['ADMIN', 'MANAGER'].includes(identity.role) ? Prisma.sql`b."organizationId" = ${identity.organizationId}`
        : Prisma.sql`o."branchId" = ${identity.branchId}`;
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const where = Prisma.sql`${scope}
        ${branchId ? Prisma.sql`AND o."branchId" = ${branchId}` : Prisma.empty}
        ${search ? Prisma.sql`AND (o."orderNumber" ILIKE ${pattern} OR w.name ILIKE ${pattern} OR r.reason ILIKE ${pattern} OR r."creditNoteNumber" ILIKE ${pattern})` : Prisma.empty}`;
    const from = Prisma.sql`FROM "WarehouseReturn" r JOIN "WarehouseOrder" o ON o.id = r."orderId" AND o."warehouseId" = r."warehouseId"
        JOIN "Branch" b ON b.id = o."branchId" JOIN "Warehouse" w ON w.id = r."warehouseId"`;
    const [rows, counts] = await Promise.all([
        prisma.$queryRaw<any[]>(Prisma.sql`SELECT r.id, r."orderId", r.status, r.reason, r."createdAt", r."totalAmount", r."creditNoteNumber",
            o."orderNumber", w.name AS "warehouseName", (SELECT COUNT(*)::int FROM "WarehouseReturnItem" i WHERE i."returnId" = r.id) AS "itemCount"
            ${from} WHERE ${where} ${status ? Prisma.sql`AND r.status = ${status}` : Prisma.empty}
            ORDER BY r."createdAt" DESC, r.id DESC LIMIT 26 OFFSET ${(page - 1) * 25}`),
        prisma.$queryRaw<{ status: string; count: number }[]>(Prisma.sql`SELECT r.status, COUNT(*)::int AS count ${from} WHERE ${where} GROUP BY r.status`),
    ]);
    return { returns: rows.slice(0, 25), page, hasMore: rows.length > 25, counts: Object.fromEntries(counts.map(row => [row.status, row.count])) };
}
