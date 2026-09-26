import { Prisma } from '@prisma/client';

export class SyncSafeConflict extends Error {}

/** Desktop ids may be local-only. Never redirect a known foreign id, and never
 * guess between multiple drawers. The branch lock also serializes first creation. */
export async function resolveSyncSafe(tx: Prisma.TransactionClient, branchId: string, incoming?: string | null) {
    await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${branchId} FOR UPDATE`;
    if (incoming) {
        const exact = await tx.safe.findUnique({ where: { id: incoming }, select: { id: true, branchId: true } });
        if (exact) {
            if (exact.branchId !== branchId) throw new SyncSafeConflict('الصندوق لا يتبع هذا الفرع؛ تتطلب العملية مراجعة.');
            return exact.id;
        }
    }
    const drawers = await tx.safe.findMany({ where: { branchId, type: 'CASH_DRAWER' }, select: { id: true }, take: 2 });
    if (drawers.length > 1) throw new SyncSafeConflict('يوجد أكثر من صندوق في الفرع؛ يلزم ربط صندوق الجهاز قبل المتابعة.');
    if (drawers.length === 1) return drawers[0].id;
    return (await tx.safe.create({ data: { name: 'الصندوق الرئيسي', type: 'CASH_DRAWER', branchId, balance: 0 } })).id;
}
