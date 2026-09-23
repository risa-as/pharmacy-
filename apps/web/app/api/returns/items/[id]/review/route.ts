import { returnedCost } from '@/app/lib/profit-math';
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
const schema = z.object({ action: z.enum(['RESTOCKED', 'DISPOSED']), batchId: z.string().optional(), newBatch: z.object({ batchNumber: z.string().trim().min(1).max(100), expiryDate: z.string().datetime() }).optional(), note: z.string().trim().min(5).max(1000), confirmed: z.literal(true) });
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
    const ctx = await getTenantContext(); if (ctx instanceof NextResponse) return ctx;
    if (!['ADMIN','MANAGER'].includes(ctx.user.role) || !ctx.userPermissions.canProcessReturn || !ctx.userPermissions.canDoStocktake)
        return NextResponse.json({ message: 'فحص المرتجع يتطلب صلاحية المدير وإدارة المخزون والمرتجعات.' }, { status: 403 });
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ message: 'أكد فحص العبوة والدفعة وأدخل نتيجة الفحص.' }, { status: 400 });
    const { id } = await props.params;
    try {
        const result = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "SaleReturnItem" WHERE id = ${id} FOR UPDATE`;
            const item = await tx.saleReturnItem.findFirst({ where: { id, saleReturn: ctx.tenantBranchWhere }, include: { saleReturn: { include: { sale: { include: { items: true } } } } } });
            if (!item) throw new Error('المرتجع غير موجود ضمن نطاقك.');
            if (item.stockStatus !== 'QUARANTINED') throw new Error('تم اتخاذ القرار مسبقاً؛ حدّث الصفحة.');
            let allocations: string | null = null;
            if (input.data.action === 'RESTOCKED') {
                if (input.data.newBatch && input.data.batchId) throw new Error('اختر دفعة موجودة أو أدخل دفعة جديدة فقط.');
                let batchId: string;
                if (input.data.newBatch) {
                    const expiry = new Date(input.data.newBatch.expiryDate);
                    if (expiry <= new Date()) throw new Error('لا يمكن إعادة مرتجع منتهي الصلاحية للبيع.');
                    const inventory = await tx.inventory.findFirst({ where: { branchId: item.saleReturn.branchId, drugId: item.drugId } });
                    if (!inventory) throw new Error('أضف تعريف الصنف في مخزون الفرع أولاً دون إضافة هذه الكمية.');
                    const cost = returnedCost([item], item.saleReturn.sale.items) / item.quantity;
                    const created = await tx.batch.create({ data: { inventoryId: inventory.id, batchNumber: input.data.newBatch.batchNumber, expiryDate: expiry, quantity: item.quantity, initialQuantity: item.quantity, costPrice: cost } });
                    batchId = created.id;
                } else {
                    const batch = await tx.batch.findFirst({ where: { id: input.data.batchId || '', inventory: { branchId: item.saleReturn.branchId, drugId: item.drugId }, expiryDate: { gt: new Date() } } });
                    if (!batch) throw new Error('اختر دفعة مطابقة للعبوة، صالحة ومن الفرع والدواء نفسيهما.');
                    const updated = await tx.batch.updateMany({ where: { id: batch.id, expiryDate: { gt: new Date() } }, data: { quantity: { increment: item.quantity } } });
                    if (updated.count !== 1) throw new Error('تغيرت صلاحية الدفعة؛ أعد الفحص.');
                    batchId = batch.id;
                }
                allocations = JSON.stringify([{ batchId, quantity: item.quantity }]);
            }
            if (input.data.action === 'DISPOSED') {
                const cost = returnedCost([item], item.saleReturn.sale.items);
                if (cost > 0) await tx.expense.create({ data: { branchId: item.saleReturn.branchId, amount: cost, category: 'تلف المرتجعات', description: `استبعاد مرتجع ${item.saleReturn.documentNumber} / ${item.id}: ${input.data.note}` } });
            }
            // No second cash refund. Disposal recognizes the inventory loss once.
            return tx.saleReturnItem.update({ where: { id }, data: { stockStatus: input.data.action, batchAllocations: allocations, stockReviewNote: input.data.note, stockReviewedBy: ctx.user.id, stockReviewedAt: new Date() } });
        });
        return NextResponse.json({ success: true, item: result });
    } catch (e) { return NextResponse.json({ message: (e as Error).message }, { status: 409 }); }
}
