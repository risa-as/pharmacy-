export const dynamic = 'force-dynamic';

// تفصيل فاتورة شراء واحدة وإلغاؤها (فحص 2026-09-17، فجوة G4).
//
// كان مسار /purchases يحمل POST وحده، والقائمة تأتي من /purchases/summary —
// فلا تفصيل لفاتورة، ولا تصحيح، ولا إلغاء: فاتورة أُدخلت بخطأ تبقى في الذمم
// الدائنة وفي المخزون إلى الأبد.
//
// **لا تعديل، إلغاء فقط، ولا حذف.** السبب: POST ينشئ لكل بند دفعة مخزون
// (WarehouseBatch) حقيقية قد تكون بِيعت أو حُمِّلت لسيارة مندوب بعدها. تعديل
// البنود كان يعني إعادة حساب مخزون مُستهلَك بأثر رجعي — مستحيل بأمان. والحذف
// كان يُلغي سجلات WarehouseStockMove المرتبطة. فالإلغاء هنا:
//   1. مشروط بألّا تكون هناك أي دفعة سداد (paidAmount = 0).
//   2. مشروط بأن تكون كل دفعة أنشأتها الفاتورة **سليمة تماماً** —
//      quantity === initialQuantity، أي لم يُصرَف منها شيء ولم تُحمَّل لمندوب.
//   3. يُصفّر كميات تلك الدفعات ويسجّل حركة ADJUSTMENT لكل واحدة (سجل التدقيق
//      يبقى كاملاً، والصفوف لا تُحذف فتبقى الحركات القديمة صالحة المرجع).
//
// Phase 3 (الأدوار والصلاحيات): العرض يتطلب canViewPurchases، والإلغاء
// canCreatePurchase — من يُدخل الفاتورة هو من يصحّح خطأه، لا المحاسب الذي
// يسدّد فقط.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

/** الدفعات التي أنشأتها بنود هذه الفاتورة. */
async function batchesOfPurchase(purchaseId: string) {
    const items = await prisma.warehousePurchaseItem.findMany({
        where: { purchaseId },
        select: { id: true },
    });
    if (items.length === 0) return [];
    return prisma.warehouseBatch.findMany({
        where: { purchaseItemId: { in: items.map((i) => i.id) } },
        select: {
            id: true, batchNumber: true, quantity: true, initialQuantity: true,
            catalogItem: { select: { drug: { select: { tradeName: true } } } },
        },
    });
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewPurchases');
        if (!gate.ok) return gate.response;

        // warehouseId في الشرط يمنع قراءة فاتورة مذخر آخر بتخمين المعرّف.
        const purchase = await prisma.warehousePurchase.findFirst({
            where: { id, warehouseId: ctx.warehouseId },
            include: {
                supplier: { select: { id: true, name: true } },
                items: {
                    include: { catalogItem: { select: { drug: { select: { tradeName: true, barcode: true } } } } },
                },
                payments: { orderBy: { paidAt: 'asc' } },
            },
        });
        if (!purchase) {
            return NextResponse.json({ error: 'فاتورة الشراء غير موجودة ضمن هذا المذخر' }, { status: 404 });
        }

        const batches = await batchesOfPurchase(purchase.id);
        const consumed = batches.filter((b) => b.quantity !== b.initialQuantity);

        return NextResponse.json({
            purchase: {
                id: purchase.id,
                supplierId: purchase.supplier.id,
                supplierName: purchase.supplier.name,
                invoiceNumber: purchase.invoiceNumber,
                total: purchase.total,
                paidAmount: purchase.paidAmount,
                remaining: Math.max(purchase.total - purchase.paidAmount, 0),
                status: purchase.status,
                issuedAt: purchase.issuedAt,
                dueAt: purchase.dueAt,
                notes: purchase.notes,
                items: purchase.items.map((it) => ({
                    id: it.id,
                    tradeName: it.catalogItem.drug.tradeName,
                    barcode: it.catalogItem.drug.barcode,
                    batchNumber: it.batchNumber,
                    expiryDate: it.expiryDate,
                    quantity: it.quantity,
                    bonusQuantity: it.bonusQuantity,
                    unitCost: it.unitCost,
                    lineTotal: it.quantity * it.unitCost,
                })),
                payments: purchase.payments.map((p) => ({
                    id: p.id, amount: p.amount, method: p.method,
                    reference: p.reference, paidAt: p.paidAt,
                })),
                // تُغذّي زرّ الإلغاء في الواجهة: تُعرض قابليته وسببها قبل الضغط.
                cancellable:
                    purchase.status !== 'CANCELLED' &&
                    purchase.paidAmount <= 0 &&
                    consumed.length === 0,
                cancelBlockers: [
                    ...(purchase.status === 'CANCELLED' ? ['الفاتورة ملغاة أصلاً.'] : []),
                    ...(purchase.paidAmount > 0
                        ? ['سُجِّلت دفعة سداد على هذه الفاتورة — اعكس الدفعة أولاً.']
                        : []),
                    ...consumed.map(
                        (b) =>
                            `صُرِف من دفعة ${b.batchNumber} (${b.catalogItem.drug.tradeName}) — ` +
                            `المتبقي ${b.quantity} من ${b.initialQuantity}.`
                    ),
                ],
            },
        });
    } catch (e: any) {
        console.error('warehouse-portal purchase detail GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تفاصيل فاتورة الشراء' }, { status: 500 });
    }
}

// PATCH: { status: 'CANCELLED' } — الإلغاء هو التعديل الوحيد المسموح.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canCreatePurchase');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || body.status !== 'CANCELLED') {
            return NextResponse.json(
                { error: 'الإلغاء هو التعديل الوحيد المسموح على فاتورة شراء — أرسل { status: "CANCELLED" }.' },
                { status: 400 }
            );
        }

        const result = await prisma.$transaction(async (tx) => {
            const purchase = await tx.warehousePurchase.findFirst({
                where: { id, warehouseId: ctx.warehouseId },
                select: { id: true, status: true, paidAmount: true, notes: true },
            });
            if (!purchase) return { error: 'فاتورة الشراء غير موجودة ضمن هذا المذخر', status: 404 };
            if (purchase.status === 'CANCELLED') {
                return { error: 'الفاتورة ملغاة أصلاً', status: 409 };
            }
            if (purchase.paidAmount > 0) {
                return {
                    error: 'سُجِّلت دفعة سداد على هذه الفاتورة — لا يمكن إلغاؤها قبل عكس الدفعة.',
                    status: 409,
                };
            }

            const items = await tx.warehousePurchaseItem.findMany({
                where: { purchaseId: purchase.id },
                select: { id: true },
            });
            const batches = items.length
                ? await tx.warehouseBatch.findMany({
                      where: { purchaseItemId: { in: items.map((i) => i.id) } },
                      select: {
                          id: true, batchNumber: true, quantity: true,
                          initialQuantity: true, catalogItemId: true,
                      },
                  })
                : [];

            // القراءة والفحص والكتابة كلها داخل المعاملة: لو بِيع من دفعة بين
            // فحص GET وضغط الزر، يُرفض الإلغاء هنا لا هناك.
            const consumed = batches.filter((b) => b.quantity !== b.initialQuantity);
            if (consumed.length > 0) {
                return {
                    error:
                        `صُرِف فعلاً من ${consumed.length} من دفعات هذه الفاتورة — ` +
                        'لا يمكن إلغاؤها. صحّح المخزون بجرد أو إتلاف بدل الإلغاء.',
                    status: 409,
                };
            }

            for (const b of batches) {
                if (b.quantity <= 0) continue;
                await tx.warehouseBatch.update({
                    where: { id: b.id },
                    data: { quantity: 0 },
                });
                await tx.warehouseStockMove.create({
                    data: {
                        catalogItemId: b.catalogItemId,
                        batchId: b.id,
                        type: 'ADJUSTMENT',
                        quantity: b.quantity,
                        reason: `إلغاء فاتورة شراء: سحب كامل دفعة ${b.batchNumber}`,
                        actorName: ctx.user.name ?? ctx.user.email ?? null,
                    },
                });
            }

            const updated = await tx.warehousePurchase.update({
                where: { id: purchase.id },
                data: { status: 'CANCELLED' },
                select: { id: true, status: true, invoiceNumber: true },
            });

            return { purchase: updated, reversedBatches: batches.length };
        });

        if ('error' in result && result.error) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        return NextResponse.json(result);
    } catch (e: any) {
        console.error('warehouse-portal purchase PATCH error:', e);
        return NextResponse.json({ error: 'فشل في إلغاء فاتورة الشراء' }, { status: 500 });
    }
}
