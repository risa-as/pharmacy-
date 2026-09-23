import { ORDER_TRANSITIONS, type OrderStatus } from './warehouse-order-state';

export function warehouseInboxQuery(status?: string | null, take?: string | null) {
    if (status && status !== 'REVIEW' && (status === 'DRAFT' || !Object.hasOwn(ORDER_TRANSITIONS, status))) {
        throw new Error('حالة الطلب غير صالحة لصندوق المذخر.');
    }
    const limit = take == null ? 100 : Number(take);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('عدد الطلبات يجب أن يكون بين 1 و100.');
    if (status === 'REVIEW') return { status: { in: ['SENT', 'UNDER_REVIEW'] as OrderStatus[] }, take: limit };
    return { status: status ? status as OrderStatus : { not: 'DRAFT' as OrderStatus }, take: limit };
}
