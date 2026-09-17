import type { Prisma, PrismaClient } from '@prisma/client';
import { decideNewInventoryPricing } from './inventory-pricing';

export class PurchaseReceiptError extends Error {
    constructor(message: string, public readonly status = 400) { super(message); }
}

/**
 * `cost` (unit purchase price) is optional: orders created without a known
 * price (e.g. mobile smart orders) get it at receipt, when the supplier's
 * invoice is in hand. When omitted the ordered line cost is kept.
 */
type ReceiptInput = { itemId: string; quantity: number; expiryDate: Date | string; batchNumber: string; cost?: number };

const MAX_UNIT_COST = 1_000_000_000;

/** One transaction for both the server action and HTTP API: stock and debt cannot diverge. */
export async function receivePurchaseStock(
    db: PrismaClient,
    purchaseId: string,
    scope: Prisma.PurchaseWhereInput,
    input: unknown,
    isPaid = false,
    actor?: { id: string; name?: string; email?: string },
) {
    if (!Array.isArray(input) || input.length === 0 || input.length > 500) {
        throw new PurchaseReceiptError('أرسل أصناف الاستلام كاملة (بحد أقصى 500 بند).');
    }
    return db.$transaction(async (tx) => {
        // Lock before reading status/items: cancellation and another receipt wait here.
        await tx.$queryRaw`SELECT "id" FROM "Purchase" WHERE "id" = ${purchaseId} FOR UPDATE`;
        const purchase = await tx.purchase.findFirst({
            where: { AND: [{ id: purchaseId }, scope] },
            include: {
                items: true, supplier: true,
                branch: { select: { organization: { select: { minProfitMargin: true } } } },
            },
        });
        if (!purchase) throw new PurchaseReceiptError('طلب الشراء غير موجود ضمن نطاقك.', 404);
        if (purchase.status !== 'PENDING') throw new PurchaseReceiptError('تمت معالجة طلب الشراء أو إلغاؤه مسبقاً.', 409);
        const seen = new Set<string>();
        const lines = input.map((raw: ReceiptInput) => {
            const item = purchase.items.find((it) => it.id === raw?.itemId);
            if (!item || seen.has(raw.itemId)) throw new PurchaseReceiptError('صنف مكرر أو لا ينتمي لفاتورة الشراء.');
            seen.add(raw.itemId);
            // This workflow closes the entire invoice; partial receipt requires its own ledger.
            if (!Number.isSafeInteger(raw.quantity) || raw.quantity <= 0 || raw.quantity !== item.quantity) {
                throw new PurchaseReceiptError('الاستلام الكامل يتطلب الكمية المعتمدة لكل بند؛ لا يمكن إغلاق فاتورة بكميات مختلفة.');
            }
            if (typeof raw.batchNumber !== 'string' || !raw.batchNumber.trim()) throw new PurchaseReceiptError('رقم الدفعة مطلوب.');
            if (!(raw.expiryDate instanceof Date) && typeof raw.expiryDate !== 'string') throw new PurchaseReceiptError('تاريخ الانتهاء غير صالح.');
            const expiry = new Date(raw.expiryDate);
            if (!Number.isFinite(expiry.getTime()) || expiry <= new Date()) throw new PurchaseReceiptError('يجب أن يكون تاريخ الانتهاء صحيحاً وفي المستقبل.');
            let cost = item.cost;
            if (raw.cost !== undefined && raw.cost !== null) {
                if (typeof raw.cost !== 'number' || !Number.isFinite(raw.cost) || raw.cost < 0 || raw.cost > MAX_UNIT_COST) {
                    throw new PurchaseReceiptError('سعر الشراء غير صالح.');
                }
                cost = raw.cost;
            }
            return { item, quantity: raw.quantity, expiry, batchNumber: raw.batchNumber.trim(), cost };
        });
        if (seen.size !== purchase.items.length) throw new PurchaseReceiptError('يجب استلام جميع بنود الفاتورة قبل إغلاقها.');

        // Prices confirmed at receipt become the invoice's line costs and total,
        // so the supplier debt / expense below reflect what was actually billed.
        for (const line of lines) {
            if (line.cost !== line.item.cost) {
                await tx.purchaseItem.update({ where: { id: line.item.id }, data: { cost: line.cost } });
            }
        }
        // Apply only the price difference, so anything else already in the total
        // (discounts or extras from other creation paths) is preserved.
        const total = Math.max(0, purchase.total + lines.reduce((sum, l) => sum + l.quantity * (l.cost - l.item.cost), 0));
        const existing = await tx.inventory.findMany({
            where: { branchId: purchase.branchId, drugId: { in: lines.map((l) => l.item.drugId) } },
            select: { drugId: true },
        });
        const known = new Set(existing.map((i) => i.drugId));
        let createdInventoryCount = 0;
        // Paid lines first: a free bonus must not establish the selling price at zero.
        lines.sort((a, b) => b.cost - a.cost);
        for (const { item, quantity, expiry, batchNumber, cost } of lines) {
            const pricing = decideNewInventoryPricing({ cost, minProfitMargin: purchase.branch.organization.minProfitMargin });
            const inventory = await tx.inventory.upsert({
                where: { drugId_branchId: { drugId: item.drugId, branchId: purchase.branchId } },
                create: { drugId: item.drugId, branchId: purchase.branchId, cost: pricing.cost, price: pricing.price },
                update: cost > 0 ? { cost } : {},
            });
            await tx.batch.create({ data: {
                inventoryId: inventory.id, quantity, initialQuantity: quantity,
                expiryDate: expiry, batchNumber, costPrice: cost, supplierId: purchase.supplierId,
            } });
            if (!known.has(item.drugId)) createdInventoryCount++;
            known.add(item.drugId);
        }
        const paidAmount = isPaid ? total : purchase.paidAmount;
        const amountToPay = Math.max(paidAmount - purchase.paidAmount, 0);
        if (amountToPay > 0) await tx.expense.create({ data: {
            branchId: purchase.branchId, amount: amountToPay, category: 'مشتريات بضاعة',
            description: `فاتورة شراء #${purchase.invoiceNumber || purchase.id.slice(0, 8)} من: ${purchase.supplier.name}`,
        } });
        const debt = Math.max(total - paidAmount, 0);
        if (debt > 0) await tx.supplier.update({ where: { id: purchase.supplierId }, data: { balance: { increment: debt } } });
        const updated = await tx.purchase.update({ where: { id: purchaseId }, data: { status: 'COMPLETED', paidAmount, total } });
        if (actor) await tx.auditLog.create({ data: {
            userId: actor.id, userName: actor.name ?? actor.email ?? actor.id,
            action: 'UPDATE', entity: 'PURCHASE', entityId: purchaseId, branchId: purchase.branchId,
            details: JSON.stringify({ event: 'received', itemCount: lines.length, paidAmount, debt }),
        } });
        return { ...updated, receivedCount: lines.length, createdInventoryCount };
    }, { maxWait: 10_000, timeout: 30_000 });
}
