import type { Prisma, WarehouseOrderStatus } from '@prisma/client';

/** Serialize all mutations of an order before touching its items, invoices or stock. */
export async function lockWarehouseOrder(tx: Prisma.TransactionClient, id: string, expected: WarehouseOrderStatus) {
    const rows = await tx.$queryRaw<Array<{ status: WarehouseOrderStatus }>>`
        SELECT "status" FROM "WarehouseOrder" WHERE "id" = ${id} FOR UPDATE
    `;
    if (rows.length !== 1 || rows[0].status !== expected) {
        throw new Error('انتقال غير شرعي: تغيّرت حالة الطلب أثناء المعالجة؛ حدّث الصفحة وأعد المحاولة.');
    }
}
