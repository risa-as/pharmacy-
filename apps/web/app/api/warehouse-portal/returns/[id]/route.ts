export const dynamic = 'force-dynamic';

// المرحلة 5 (الصقل التجاري) §Part 4: قرار المذخر على طلب إرجاع — قبول أو رفض.
// يتطلب canQuoteOrders (نفس صلاحية تسعير الطلبات — القرار المالي على الإرجاع
// هو استمرار لنفس مسؤولية "تسعير/مراجعة الطلب"، لا صلاحية جديدة منفصلة).
//
// القبول (ACCEPTED) داخل معاملة واحدة:
//   1) تحديث حالة الإرجاع نفسه ذرّياً (CAS: PENDING → ACCEPTED) — يمنع قبولاً
//      مزدوجاً متزامناً من تطبيق الخصم مرتين.
//   2) applyReturnCredit() من app/lib/warehouse-returns.ts تحسب الإجمالي/الحالة
//      الجديدين لفاتورة المذخر — نفس القاعدة النقية المُختبَرة، لا حساب مستقل هنا.
//   3) تحديث الفاتورة ذرّياً (CAS على total/paidAmount كما قُرئا) — يمنع تعارضاً
//      مع دفعة متزامنة أخرى على نفس الفاتورة (نفس نمط
//      app/api/warehouse-portal/invoices/[id]/payments/route.ts).
//   4) إعادة الكمية للمخزون القابل للبيع لكل صنف تتبَّعه هذا المذخر فعلاً —
//      انظر تعليق stockOutcomeFor أدناه لقرار "أي دفعة" ولماذا لا تُنشَأ دفعة
//      وهمية أو تُحيا دفعة منتهية.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { applyReturnCredit } from '@/app/lib/warehouse-returns';
import { decideStockTracking } from '@/app/lib/warehouse-stock';

class AlreadyProcessedError extends Error {}
class CreditRejectedError extends Error {}
class ConcurrentInvoiceChangeError extends Error {}
class NoInvoiceError extends Error {}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canQuoteOrders');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        const action = body?.action;
        if (action !== 'ACCEPTED' && action !== 'REJECTED') {
            return NextResponse.json({ error: 'action يجب أن يكون ACCEPTED أو REJECTED' }, { status: 400 });
        }
        const reason = typeof body?.reason === 'string' ? body.reason.trim() || null : null;

        const returnRecord = await prisma.warehouseReturn.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            include: { items: true },
        });
        if (!returnRecord) {
            return NextResponse.json({ error: 'طلب الإرجاع غير موجود في صندوق مذخرك' }, { status: 404 });
        }
        if (returnRecord.status !== 'PENDING') {
            return NextResponse.json(
                { error: `تمت معالجة طلب الإرجاع هذا بالفعل (${returnRecord.status}).` },
                { status: 409 }
            );
        }

        if (action === 'REJECTED') {
            const updated = await prisma.$transaction(async (tx) => {
                const applied = await tx.warehouseReturn.updateMany({
                    where: { id: returnRecord.id, status: 'PENDING' },
                    data: { status: 'REJECTED' },
                });
                if (applied.count !== 1) {
                    throw new AlreadyProcessedError('تمت معالجة طلب الإرجاع هذا بالفعل من طرف آخر.');
                }
                await tx.warehouseOrderEvent.create({
                    data: {
                        orderId: returnRecord.orderId,
                        actorType: 'WAREHOUSE',
                        actorName: ctx.user.name ?? ctx.user.email ?? null,
                        type: 'RETURN_REJECTED',
                        payload: { returnId: returnRecord.id, reason },
                    },
                });
                return tx.warehouseReturn.findUniqueOrThrow({ where: { id: returnRecord.id } });
            });
            return NextResponse.json({ return: updated });
        }

        // action === 'ACCEPTED'
        const now = new Date();

        const result = await prisma.$transaction(async (tx) => {
            const appliedReturn = await tx.warehouseReturn.updateMany({
                where: { id: returnRecord.id, status: 'PENDING' },
                data: { status: 'ACCEPTED' },
            });
            if (appliedReturn.count !== 1) {
                throw new AlreadyProcessedError('تمت معالجة طلب الإرجاع هذا بالفعل من طرف آخر.');
            }

            const invoice = await tx.warehouseInvoice.findUnique({ where: { orderId: returnRecord.orderId } });
            if (!invoice) {
                throw new NoInvoiceError('لا توجد فاتورة مرتبطة بهذا الطلب — تعذّر تطبيق الإشعار الدائن.');
            }

            const credit = applyReturnCredit({
                invoiceTotal: invoice.total,
                invoicePaidAmount: invoice.paidAmount,
                invoiceStatus: invoice.status,
                creditAmount: returnRecord.totalAmount,
            });
            if (!credit.ok) {
                throw new CreditRejectedError(credit.error);
            }

            const appliedInvoice = await tx.warehouseInvoice.updateMany({
                where: { id: invoice.id, total: invoice.total, paidAmount: invoice.paidAmount },
                data: { total: credit.newTotal, status: credit.newStatus },
            });
            if (appliedInvoice.count !== 1) {
                throw new ConcurrentInvoiceChangeError(
                    'تغيّرت الفاتورة أثناء المعالجة (دفعة أو إرجاع آخر متزامن) — أعد المحاولة.'
                );
            }

            // إعادة الكمية للمخزون — صنفاً بصنف، ولكل صنف قرار مستقل حسب حالة دفعاته.
            const stockOutcomes: Array<{ barcode: string; restored: boolean; reason?: string }> = [];
            for (const item of returnRecord.items) {
                const catalogItem = await tx.warehouseCatalogItem.findUnique({
                    where: { warehouseId_barcode: { warehouseId: ctx.warehouseId, barcode: item.barcode } },
                    include: { batches: true },
                });

                if (!catalogItem) {
                    stockOutcomes.push({ barcode: item.barcode, restored: false, reason: 'الصنف لم يعد في الكتالوج' });
                    continue;
                }

                // قرار ذاتي الضبط مطابق لمسار الشحن: صنف بلا أي دفعة إطلاقاً يعني
                // أن هذا المذخر لا يتتبَّع مخزونه — لا شيء يُعاد لأنه لا يوجد شيء
                // "قابل للبيع" مُتتبَّع أصلاً لهذا الصنف.
                if (decideStockTracking(catalogItem.batches.length) === 'UNTRACKED_SKIP') {
                    stockOutcomes.push({ barcode: item.barcode, restored: false, reason: 'صنف غير مُتتبَّع مخزونياً' });
                    continue;
                }

                // اختيار الدفعة: القيد الحقيقي أن WarehouseBatch.expiryDate غير
                // اختياري وWarehouseReturnItem لا يحمل أي إشارة دفعة/انتهاء عن
                // الوحدات المُرجَعة فعلياً (order items لا تُخصَّص لدفعة بعينها عند
                // البيع). القرار: إن وُجدت دفعة واحدة غير منتهية فأكثر، تُضاف
                // الكمية إلى **أقربها انتهاءً** (نفس ترتيب FEFO في allocateFEFO) —
                // فهي أول دفعة ستُصرَف تحت FEFO على أي حال، فاختيار أي دفعة غير
                // منتهية غيرها لا يغيّر شيئاً عملياً بينما هذا الاختيار هو الأكثر
                // تحفّظاً افتراضاً عن العمر الفعلي المجهول للوحدات المُرجَعة. لا
                // تُحيا دفعة منتهية إطلاقاً (محظور صراحة)، ولا تُخترَع دفعة جديدة
                // بتاريخ انتهاء وهمي (لا معلومة صادقة نملكها عنه) — إن لم توجد أي
                // دفعة غير منتهية، الخيار الصادق الوحيد هو عدم إعادة الكمية
                // للمخزون القابل للبيع، مع إبقاء الإشعار الدائن المالي قائماً
                // (الصيدلية تُعوَّض مالياً بصرف النظر عن مصير المخزون فعلياً).
                const nonExpired = catalogItem.batches
                    .filter((b) => b.expiryDate.getTime() > now.getTime())
                    .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

                if (nonExpired.length === 0) {
                    stockOutcomes.push({ barcode: item.barcode, restored: false, reason: 'كل دفعات هذا الصنف منتهية الصلاحية' });
                    continue;
                }

                const chosen = nonExpired[0];
                await tx.warehouseBatch.update({
                    where: { id: chosen.id },
                    data: { quantity: { increment: item.quantity } },
                });
                await tx.warehouseStockMove.create({
                    data: {
                        catalogItemId: catalogItem.id,
                        batchId: chosen.id,
                        type: 'RETURN',
                        quantity: item.quantity,
                        actorName: ctx.user.name ?? ctx.user.email ?? null,
                        orderId: returnRecord.orderId,
                        reason: 'إرجاع مقبول من الصيدلية',
                    },
                });
                stockOutcomes.push({ barcode: item.barcode, restored: true });
            }

            await tx.warehouseOrderEvent.create({
                data: {
                    orderId: returnRecord.orderId,
                    actorType: 'WAREHOUSE',
                    actorName: ctx.user.name ?? ctx.user.email ?? null,
                    type: 'RETURN_ACCEPTED',
                    payload: { returnId: returnRecord.id, totalAmount: returnRecord.totalAmount, invoiceId: invoice.id, stockOutcomes },
                },
            });

            const finalReturn = await tx.warehouseReturn.findUniqueOrThrow({ where: { id: returnRecord.id } });
            const finalInvoice = await tx.warehouseInvoice.findUniqueOrThrow({ where: { id: invoice.id } });

            return { return: finalReturn, invoice: finalInvoice, stockOutcomes };
        });

        return NextResponse.json(result);
    } catch (e: any) {
        if (e instanceof AlreadyProcessedError) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        if (e instanceof CreditRejectedError) {
            return NextResponse.json({ error: e.message, code: 'CREDIT_REJECTED' }, { status: 400 });
        }
        if (e instanceof ConcurrentInvoiceChangeError) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        if (e instanceof NoInvoiceError) {
            return NextResponse.json({ error: e.message }, { status: 400 });
        }
        console.error('warehouse-portal returns PATCH error:', e);
        return NextResponse.json({ error: 'فشل في معالجة طلب الإرجاع' }, { status: 500 });
    }
}
