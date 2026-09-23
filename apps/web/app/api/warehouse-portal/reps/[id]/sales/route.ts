import { nextDocumentReference } from "@/app/lib/document-reference";
export const dynamic = 'force-dynamic';

// المندوبون (مذاخر B2B): تسجيل فاتورة بيع ميدانية من بضاعة سيارة مندوب.
// الفرق الجوهري عن WarehouseOrder/WarehouseInvoice: لا طلب سابق ولا تفاوض —
// بيع فوري مرتبط الآن بحساب مؤسسة إلزامي؛ الاسم النهائي من الحساب نفسه.
// أوقف البيع باسم حر لمنع تجاوز حظر العميل وحده الائتماني.
//
// أصل البضاعة: بنود الفاتورة تُخصَم من WarehouseRepStock (بضاعة سيارة هذا
// المندوب تحديداً) حصراً — لا من WarehouseBatch الرئيسي مباشرة (ذلك يحدث فقط
// عند التحميل، انظر .../load). كل سطر يحدّد إما batchId (دفعة محدَّدة من
// رصيد المندوب) أو catalogItemId (فتُطبَّق FEFO داخل رصيد المندوب فقط عبر
// allocateFEFO من warehouse-stock.ts — نفس دالة FEFO المستخدَمة على مستوى
// المخزون الرئيسي، مُغذّاة هنا بدفعات المندوب لا دفعات المخزون الرئيسي).
//
// البونص: bonusQuantity يخصم مخزوناً بلا إيراد — نفس قاعدة computeFieldSaleProfit
// في app/lib/warehouse-reps.ts (لا حساب هامش موازٍ هنا). unitCost يُلتقَط من
// WarehouseBatch.costPrice **وقت البيع** ويُخزَّن على البند مباشرة — تغيّر
// كلفة الكتالوج لاحقاً لا يعيد كتابة هذا التاريخ.
//
// total يُحسَب دائماً على الخادم (= إيراد computeFieldSaleProfit، أي مجموع
// الكمية المدفوعة × السعر لكل سطر، بلا البونص) — لا يُقبَل من جسم الطلب.
// رقم الفاتورة: نفس نمط الطابع الزمني base-36 + إعادة محاولة + فشل صريح
// المستخدَم في app/api/warehouses/orders/[id]/route.ts لرقم فاتورة WI-.
//
// Phase 3 (الأدوار والصلاحيات): يتطلب canSellField.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { warehouseCommand, warehouseReplay, runWarehouseOperation, WarehouseOperationError } from '@/app/lib/warehouse-operation';
import { customerOutstanding } from '@/app/lib/warehouse-receivables';
import { checkCreditLimit } from '@/app/lib/warehouse-accounts';
import { allocateFEFO, expiryBucket, type BatchLike } from '@/app/lib/warehouse-stock';
import { totalUnitsLeavingStock } from '@/app/lib/warehouse-bonus';
import { computeFieldSaleProfit, repStockAvailable } from '@/app/lib/warehouse-reps';
import { computeInvoiceStatus } from '@/app/lib/warehouse-accounts';

interface RawLine {
    catalogItemId?: unknown;
    batchId?: unknown;
    quantity?: unknown;
    bonusQuantity?: unknown;
    unitPrice?: unknown;
}

interface PreparedItem {
    batchId: string;
    catalogItemId: string;
    quantity: number;
    bonusQuantity: number;
    unitPrice: number;
    unitCost: number;
}

/** يُرمى عند استنزاف رصيد المندوب من دفعة متزامن (بيع/تحميل آخر سبق هذا البيع على نفس الدفعة). */
class ConcurrentRepStockError extends Error {}
/** يُرمى عند فشل توليد رقم فاتورة فريد بعد كل المحاولات — فشل صريح بدل كتابة null. */
class InvoiceNumberGenerationError extends Error {}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canSellField');
        if (!gate.ok) return gate.response;

        const rep = await prisma.warehouseRep.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            select: { id: true, isActive: true },
        });
        if (!rep) {
            return NextResponse.json({ error: 'المندوب غير موجود ضمن هذا المذخر' }, { status: 404 });
        }
        if (!rep.isActive) {
            return NextResponse.json({ error: 'لا يمكن تسجيل بيع لمندوب موقوف.' }, { status: 400 });
        }

        const body = await req.json().catch(() => null);
        const command = warehouseCommand(ctx.warehouseId, `rep-sale:${params.id}`, body);
        const replay = await warehouseReplay(prisma, command);
        if (replay) return NextResponse.json({ fieldSale: replay });
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        let customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
        if (!customerName) {
            return NextResponse.json({ error: 'اسم الصيدلية (العميل) مطلوب' }, { status: 400 });
        }

        const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

        let soldAt = new Date();
        if (body.soldAt !== undefined && body.soldAt !== null) {
            const d = new Date(body.soldAt);
            if (Number.isNaN(d.getTime())) {
                return NextResponse.json({ error: 'تاريخ البيع غير صالح' }, { status: 400 });
            }
            soldAt = d;
        }

        // Every credit sale requires a canonical customer. Free-text names cannot
        // bypass a blocked account or create unbounded unassigned debt.
        if (typeof body.organizationId !== 'string' || !body.organizationId.trim()) {
            return NextResponse.json({ error: 'اختر عميلاً مسجلاً؛ البيع باسم حر دون ربط حساب العميل غير مسموح.' }, { status: 400 });
        }
        let organizationId: string | null = null;
        if (body.organizationId !== undefined && body.organizationId !== null && body.organizationId !== '') {
            if (typeof body.organizationId !== 'string') {
                return NextResponse.json({ error: 'organizationId غير صالح' }, { status: 400 });
            }
            const org = await prisma.organization.findUnique({ where: { id: body.organizationId }, select: { id: true, name: true } });
            if (!org) {
                return NextResponse.json({ error: 'الصيدلية (المنظمة) المحدَّدة غير موجودة.' }, { status: 404 });
            }
            organizationId = org.id;
            customerName = org.name;
        }

        const rawLines: RawLine[] = Array.isArray(body.lines) ? body.lines : [];
        if (rawLines.length === 0) {
            return NextResponse.json({ error: 'يجب أن تحتوي الفاتورة على بند واحد على الأقل' }, { status: 400 });
        }

        const validationErrors: string[] = [];
        interface ParsedLine { catalogItemId?: string; batchId?: string; quantity: number; bonusQuantity: number; unitPrice: number }
        const parsedLines: ParsedLine[] = [];

        rawLines.forEach((line, index) => {
            const label = `السطر رقم ${index + 1}`;
            const catalogItemId = typeof line.catalogItemId === 'string' && line.catalogItemId ? line.catalogItemId : undefined;
            const batchId = typeof line.batchId === 'string' && line.batchId ? line.batchId : undefined;
            const quantity = Number(line.quantity);
            const bonusQuantity = line.bonusQuantity === undefined || line.bonusQuantity === null ? 0 : Number(line.bonusQuantity);
            const unitPrice = Number(line.unitPrice);

            if (!catalogItemId && !batchId) {
                validationErrors.push(`${label}: حدّد إما catalogItemId (لتطبيق FEFO) أو batchId (دفعة محدَّدة).`);
                return;
            }
            if (catalogItemId && batchId) {
                validationErrors.push(`${label}: حدّد catalogItemId أو batchId وليس كليهما.`);
                return;
            }
            if (!Number.isInteger(quantity) || quantity <= 0) {
                validationErrors.push(`${label}: الكمية يجب أن تكون عدداً صحيحاً موجباً.`);
                return;
            }
            if (!Number.isInteger(bonusQuantity) || bonusQuantity < 0) {
                validationErrors.push(`${label}: كمية البونص يجب أن تكون عدداً صحيحاً غير سالب.`);
                return;
            }
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                validationErrors.push(`${label}: سعر الوحدة يجب أن يكون رقماً غير سالب.`);
                return;
            }

            parsedLines.push({ catalogItemId, batchId, quantity, bonusQuantity, unitPrice });
        });

        if (validationErrors.length > 0) {
            return NextResponse.json({ error: 'بيانات البيع غير صالحة', errors: validationErrors }, { status: 400 });
        }

        // رصيد المندوب الحالي بالكامل (مع تفاصيل الدفعة اللازمة: الصنف/الكلفة/الانتهاء).
        const repStockRows = await prisma.warehouseRepStock.findMany({
            where: { repId: rep.id },
            select: {
                batchId: true,
                quantity: true,
                batch: {
                    select: {
                        expiryDate: true,
                        costPrice: true,
                        catalogItemId: true,
                        catalogItem: { select: { drug: { select: { tradeName: true } } } },
                    },
                },
            },
        });

        // نسخة قابلة للتعديل محلياً — تتحدَّث مع كل سطر يُعالَج كي لا يُستهلَك
        // نفس الرصيد مرتين لبندين في نفس الطلب (نفس همّ aggregateDeductions في
        // مسار الشحن، لكن هنا داخل حلقة تسلسلية بسيطة بدل تجميع مسبق).
        const remainingByBatch = new Map(repStockRows.map((r) => [r.batchId, r.quantity]));
        const batchInfoById = new Map(repStockRows.map((r) => [r.batchId, r.batch]));

        const preparedItems: PreparedItem[] = [];
        const shortfallErrors: string[] = [];
        const now = new Date();

        for (let index = 0; index < parsedLines.length; index++) {
            const line = parsedLines[index];
            const label = `السطر رقم ${index + 1}`;
            const needed = totalUnitsLeavingStock({ soldQuantity: line.quantity, bonusQuantity: line.bonusQuantity });

            if (line.batchId) {
                const info = batchInfoById.get(line.batchId);
                // repStockAvailable() من warehouse-reps.ts هي القاعدة الوحيدة
                // لـ"كم يملك المندوب من دفعة معيّنة؟" — مُغذّاة هنا بلقطة حالية
                // من remainingByBatch (لا بالرصيد الأصلي المقروء من القاعدة)
                // لأن remainingByBatch رصيد جارٍ يتحدَّث سطراً بسطر ضمن نفس
                // الطلب؛ تغذيتها بالرصيد الأصلي كانت ستتجاهل خصم سطر سابق لنفس
                // الدفعة في نفس الطلب.
                const available = repStockAvailable(
                    Array.from(remainingByBatch, ([batchId, quantity]) => ({ batchId, quantity })),
                    line.batchId
                );
                if (!info) {
                    shortfallErrors.push(`${label}: لا يملك المندوب أي رصيد من هذه الدفعة.`);
                    continue;
                }
                if (expiryBucket(info.expiryDate, now) === 'EXPIRED') {
                    shortfallErrors.push(`${label}: ${info.catalogItem.drug.tradeName} — الدفعة منتهية الصلاحية في بضاعة المندوب.`);
                    continue;
                }
                if (needed > available) {
                    shortfallErrors.push(
                        `${label}: ${info.catalogItem.drug.tradeName} — المطلوب ${needed} والمتوفر لدى المندوب ${available} فقط.`
                    );
                    continue;
                }
                remainingByBatch.set(line.batchId, available - needed);
                preparedItems.push({
                    batchId: line.batchId,
                    catalogItemId: info.catalogItemId,
                    quantity: line.quantity,
                    bonusQuantity: line.bonusQuantity,
                    unitPrice: line.unitPrice,
                    unitCost: info.costPrice,
                });
                continue;
            }

            // مسار FEFO: نبني قائمة دفعات المندوب لهذا الصنف تحديداً بالكميات
            // *المتبقية حالياً* (بعد أي خصم لسطر سابق في نفس الطلب)، ثم نستدعي
            // allocateFEFO — نفس دالة FEFO الوحيدة في المشروع، مُغذّاة برصيد
            // المندوب لا برصيد المخزون الرئيسي (الفرق الحرج الذي يمنع بيع خيالي).
            const candidateBatches: BatchLike[] = [];
            for (const [batchId, qty] of Array.from(remainingByBatch)) {
                const info = batchInfoById.get(batchId)!;
                if (info.catalogItemId === line.catalogItemId && qty > 0) {
                    candidateBatches.push({ id: batchId, quantity: qty, expiryDate: info.expiryDate });
                }
            }

            const allocation = allocateFEFO(candidateBatches, needed, now);
            if (!allocation.ok) {
                const tradeName = candidateBatches.length > 0
                    ? batchInfoById.get(candidateBatches[0].id)!.catalogItem.drug.tradeName
                    : line.catalogItemId!;
                shortfallErrors.push(
                    `${label}: ${tradeName} — رصيد المندوب غير كافٍ (المطلوب ${needed}، الناقص ${allocation.shortfall}).`
                );
                continue;
            }

            // توزيع الكمية المباعة أولاً على الدفعات بترتيب FEFO (allocation.allocations
            // محفوظ بنفس ترتيب انتهاء الصلاحية تصاعدياً)، ثم البونص على ما تبقّى من
            // سعة كل دفعة بنفس الترتيب — يحافظ على أولوية FEFO للوحدات ذات
            // الإيراد أولاً دون التأثير على إجمالي الكلفة (يُحتسَب من الدفعات
            // الفعلية المُستهلَكة بصرف النظر عن تصنيف الوحدة "مباعة" أو "بونص").
            let remainingSold = line.quantity;
            let remainingBonus = line.bonusQuantity;
            for (const alloc of allocation.allocations) {
                const soldPortion = Math.min(remainingSold, alloc.quantity);
                remainingSold -= soldPortion;
                const bonusPortion = Math.min(remainingBonus, alloc.quantity - soldPortion);
                remainingBonus -= bonusPortion;

                remainingByBatch.set(alloc.batchId, (remainingByBatch.get(alloc.batchId) ?? 0) - alloc.quantity);
                const info = batchInfoById.get(alloc.batchId)!;
                preparedItems.push({
                    batchId: alloc.batchId,
                    catalogItemId: info.catalogItemId,
                    quantity: soldPortion,
                    bonusQuantity: bonusPortion,
                    unitPrice: line.unitPrice,
                    unitCost: info.costPrice,
                });
            }
        }

        if (shortfallErrors.length > 0) {
            return NextResponse.json({ error: 'تعذّر تسجيل البيع — رصيد المندوب غير كافٍ', errors: shortfallErrors }, { status: 409 });
        }

        // الإجمالي يُحسَب هنا حصراً من computeFieldSaleProfit().revenue — بلا
        // قبول أي total من جسم الطلب مباشرة، وبلا نسخة موازية لحساب الإيراد.
        const { revenue: total } = computeFieldSaleProfit(preparedItems);
        const status = computeInvoiceStatus({ total, paidAmount: 0 });

        // تجميع الخصم الفعلي لكل دفعة (قد يظهر batchId أكثر من مرة إن حُدِّد
        // صراحة في سطر وأيضاً وقعت عليه allocateFEFO في سطر آخر بنفس الطلب).
        const decrementByBatch = new Map<string, number>();
        for (const item of preparedItems) {
            const leaving = totalUnitsLeavingStock({ soldQuantity: item.quantity, bonusQuantity: item.bonusQuantity });
            decrementByBatch.set(item.batchId, (decrementByBatch.get(item.batchId) ?? 0) + leaving);
        }

        const created = await prisma.$transaction(async (tx) => runWarehouseOperation(tx, command, async () => {
            if (organizationId) {
                const customer = await tx.warehouseCustomer.upsert({
                    where: { warehouseId_organizationId: { warehouseId: ctx.warehouseId, organizationId } },
                    create: { warehouseId: ctx.warehouseId, organizationId }, update: {},
                });
                await tx.$queryRaw`SELECT id FROM "WarehouseCustomer" WHERE id = ${customer.id} FOR UPDATE`;
                const terms = await tx.warehouseCustomer.findUniqueOrThrow({ where: { id: customer.id } });
                if (terms.isBlocked) throw new WarehouseOperationError('العميل موقوف عن التعامل.', 403);
                const outstanding = await customerOutstanding(tx, ctx.warehouseId, organizationId, terms.openingBalance);
                const credit = checkCreditLimit({ creditLimit: terms.creditLimit, outstanding, newOrderTotal: total });
                if (!credit.ok) throw new WarehouseOperationError(credit.error);
            }
            for (const [batchId, decrement] of Array.from(decrementByBatch)) {
                // الحارس: نفس نمط compare-and-swap في deductStockForShipment —
                // decrement مشروط بـ quantity >= المطلوب في شرط WHERE، فبيعان
                // متزامنان لنفس دفعة المندوب لا يمكن أن يستنزفاها تحت الصفر.
                const applied = await tx.warehouseRepStock.updateMany({
                    where: { repId: rep.id, batchId, quantity: { gte: decrement } },
                    data: { quantity: { decrement } },
                });
                if (applied.count !== 1) {
                    throw new ConcurrentRepStockError(
                        'تغيّر رصيد المندوب أثناء المعالجة (عملية بيع/تحميل متزامنة أخرى) — أعد المحاولة.'
                    );
                }
            }

            const invoiceNumber = await nextDocumentReference(tx, "FSL");

            const sale = await tx.warehouseFieldSale.create({
                data: {
                    warehouseId: ctx.warehouseId,
                    repId: rep.id,
                    organizationId,
                    customerName,
                    invoiceNumber,
                    total,
                    paidAmount: 0,
                    status,
                    soldAt,
                    notes,
                    items: {
                        create: preparedItems.map((item) => ({
                            batchId: item.batchId,
                            catalogItemId: item.catalogItemId,
                            quantity: item.quantity,
                            bonusQuantity: item.bonusQuantity,
                            unitPrice: item.unitPrice,
                            unitCost: item.unitCost,
                        })),
                    },
                },
                include: { items: true },
            });

            return sale;
        }), { maxWait: 20000, timeout: 20000 });

        return NextResponse.json({ fieldSale: created }, { status: 201 });
    } catch (e: any) {
        if (e instanceof WarehouseOperationError) return NextResponse.json({ error: e.message }, { status: e.status });
        if (e instanceof ConcurrentRepStockError) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        if (e instanceof InvoiceNumberGenerationError) {
            return NextResponse.json({ error: e.message }, { status: 500 });
        }
        if (e?.code === 'P2002') {
            return NextResponse.json({ error: 'تعارض في رقم الفاتورة — أعد المحاولة.' }, { status: 409 });
        }
        console.error('warehouse-portal rep field sale POST error:', e);
        return NextResponse.json({ error: 'فشل في تسجيل البيع الميداني' }, { status: 500 });
    }
}
