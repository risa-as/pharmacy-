export const dynamic = 'force-dynamic';

// المرحلة 6 من ميزة المذاخر: جسر الشحن/التسليم — يفتح الانتقالين APPROVED→SHIPPED
// و SHIPPED→DELIVERED اللذين تسمح بهما آلة الحالات لكن لم يكن لهما أي مسار API قبل
// هذا الملف. بدونه يتعطل الطلب عند APPROVED والمذخر لا يستطيع أبداً وضعه "مُسلَّم" —
// وهذا بالضبط الحلقة المفقودة في تدفق: أرسل الطلب → المذخر يشحن → يسلّم → الصيدلي يستلم.
//
// المرحلة ب (تتبّع المخزون): عند الانتقال APPROVED → SHIPPED تحديداً يُخصَم
// المخزون فعلياً بأسلوب FEFO — انظر deductStockForShipment أدناه للقاعدة
// ذاتية الضبط الكاملة (مذخر بلا دفعات مُدخَلة لصنف يستمر بلا تحقق كما كان).
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import { lockWarehouseOrder } from '@/app/lib/warehouse-order-lock';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { assertTransition } from '@/app/lib/warehouse-order-state';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { sendAndPersistNotification } from '@/app/lib/notifications/notificationTriggers';
import {
    allocateFEFO,
    computeRequiredDeductions,
    aggregateDeductions,
    decideStockTracking,
    type OrderItemForDeduction,
} from '@/app/lib/warehouse-stock';

type ShippingStatus = 'SHIPPED' | 'DELIVERED';
const ALLOWED_STATUSES: ShippingStatus[] = ['SHIPPED', 'DELIVERED'];

/** يُرمى عند نقص المخزون — يُلتقط في catch أدناه ليُترجَم إلى 409 مع أسماء الأصناف الناقصة. */
class StockShortfallError extends Error {
    constructor(message: string, public readonly shortfalls: Array<{ barcode: string; tradeName: string; missing: number }>) {
        super(message);
    }
}

/**
 * خصم المخزون عند الشحن (APPROVED → SHIPPED) — يعمل **داخل** معاملة الطلب
 * نفسها فيتراجع تحديث الحالة تلقائياً إن فشل الخصم (رمي = rollback كامل).
 *
 * القاعدة ذاتية الضبط (مقصودة بالضبط كما هي، لا تُبسَّط): لكل صنف في الطلب —
 *   - إن لم يملك صنف الكتالوج المطابق **أي دفعة على الإطلاق** (بما فيها حالة
 *     عدم وجود صنف كتالوج مطابق أصلاً)، فهذا المذخر لم يبدأ تتبّع مخزون هذا
 *     الصنف بعد → يُتجاهَل الخصم بصمت ويُشحَن الصنف كما كان يُشحَن قبل هذه
 *     الميزة تماماً.
 *   - إن ملك دفعة واحدة فأكثر، فالتتبّع بدأ فعلياً → يُطبَّق التحقق فوراً عبر
 *     allocateFEFO (أول منتهي أول مصروف)، فتصنيف "طُبِّق التتبّع على هذا
 *     الصنف؟" مشتق حصراً من وجود بيانات لا من علم/إعداد يدوي، فلا حاجة ليوم
 *     ترحيل أو تفعيل صريح: أي مذخر يبدأ إدخال دفعاته يخضع للتحقق من اللحظة
 *     الأولى، وأي مذخر لم يدخل شيئاً بعد يستمر بلا انقطاع في عمله الحالي.
 *
 * عند نقص أي صنف (شحّة تخصيص) تفشل العملية **كاملة** برسالة تسمّي الأصناف
 * الناقصة والكمية الناقصة لكل منها — لا شحن جزئي صامت لبعض الأصناف بينما
 * تفشل أخرى.
 */
async function deductStockForShipment(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    orderId: string,
    items: Array<{
        quantity: number;
        unitPrice: number;
        quotedPrice: number | null;
        quotedQuantity: number | null;
        status: string;
        bonusQuantity: number;
        drug: { barcode: string; tradeName: string };
    }>,
    actorName: string | null
): Promise<void> {
    const deductionInputs: OrderItemForDeduction[] = items.map((it) => ({
        barcode: it.drug.barcode,
        status: it.status as OrderItemForDeduction['status'],
        quantity: it.quantity,
        quotedQuantity: it.quotedQuantity,
        unitPrice: it.unitPrice,
        quotedPrice: it.quotedPrice,
        // ميزة البونص: تُضاف لكمية الخصم داخل computeRequiredDeductions فقط
        // إن كان السطر يشحن فعلاً (quantity > 0 بعد effectiveLine) — انظر
        // تعليقها في warehouse-stock.ts.
        bonusQuantity: it.bonusQuantity,
    }));

    // تجميع أولاً — بند طلبين لنفس الباركود يجب أن يُخصَما معاً من نفس الدفعات
    // دفعة واحدة، وإلا يُخصَّص من نفس المخزون مرتين (انظر تعليق aggregateDeductions).
    const deductions = aggregateDeductions(computeRequiredDeductions(deductionInputs));
    if (deductions.length === 0) return; // كل بنود الطلب OUT_OF_STOCK — لا شيء يُشحَن أصلاً.

    const tradeNameByBarcode = new Map(items.map((it) => [it.drug.barcode, it.drug.tradeName]));

    const catalogItems = await tx.warehouseCatalogItem.findMany({
        where: { warehouseId, barcode: { in: deductions.map((d) => d.barcode) } },
        include: { batches: true },
    });
    const catalogByBarcode = new Map(catalogItems.map((c) => [c.barcode, c]));
    const tradeNameByCatalogItemId = new Map(
        catalogItems.map((c) => [c.id, tradeNameByBarcode.get(c.barcode) ?? c.barcode])
    );

    const shortfalls: Array<{ barcode: string; tradeName: string; missing: number }> = [];
    const plannedMoves: Array<{ catalogItemId: string; batchId: string; quantity: number }> = [];

    for (const d of deductions) {
        const catalogItem = catalogByBarcode.get(d.barcode);
        const batchCount = catalogItem?.batches.length ?? 0;

        if (decideStockTracking(batchCount) === 'UNTRACKED_SKIP') {
            continue; // لا صنف كتالوج مطابق، أو صنف بلا أي دفعة — غير متتبَّع، يُشحَن بلا تحقق.
        }

        const allocation = allocateFEFO(catalogItem!.batches, d.quantity);
        if (!allocation.ok) {
            shortfalls.push({
                barcode: d.barcode,
                tradeName: tradeNameByBarcode.get(d.barcode) ?? d.barcode,
                missing: allocation.shortfall,
            });
            continue;
        }

        for (const a of allocation.allocations) {
            plannedMoves.push({ catalogItemId: catalogItem!.id, batchId: a.batchId, quantity: a.quantity });
        }
    }

    if (shortfalls.length > 0) {
        const detail = shortfalls.map((s) => `${s.tradeName} (ناقص ${s.missing})`).join('، ');
        throw new StockShortfallError(
            `تعذّر شحن الطلب — المخزون غير كافٍ للأصناف التالية: ${detail}.`,
            shortfalls
        );
    }

    // كل الأصناف المتتبَّعة كافية بحسب القراءة أعلاه — لكن تلك القراءة (findMany)
    // لا تقفل الصفوف: طلب آخر يشحن **نفس** الدفعة بالتزامن قد يستهلكها بين
    // القراءة وهذا التحديث. الحارس: decrement مشروط بـ quantity >= المطلوب في
    // شرط الـ WHERE نفسه (ذرّي على مستوى الصف)؛ إن لم يتحدَّث أي صف (count 0)
    // فهذا يعني استهلاكاً متزامناً — نرمي فتتراجع المعاملة **كاملة** (بينها أي
    // خصم آخر طُبِّق للتو ضمن نفس هذا الطلب)، فلا يوجد أبداً رصيد سالب ولا خصم
    // جزئي صامت لبعض الأصناف دون بعض.
    const raceFailures: string[] = [];
    for (const move of plannedMoves) {
        const applied = await tx.warehouseBatch.updateMany({
            where: { id: move.batchId, quantity: { gte: move.quantity } },
            data: { quantity: { decrement: move.quantity } },
        });
        if (applied.count !== 1) {
            const tradeName = tradeNameByCatalogItemId.get(move.catalogItemId) ?? move.catalogItemId;
            if (!raceFailures.includes(tradeName)) raceFailures.push(tradeName);
            continue;
        }
        await tx.warehouseStockMove.create({
            data: {
                catalogItemId: move.catalogItemId,
                batchId: move.batchId,
                type: 'SHIPMENT',
                quantity: move.quantity,
                actorName,
                orderId,
            },
        });
    }

    if (raceFailures.length > 0) {
        throw new StockShortfallError(
            `تعذّر شحن الطلب — تغيّر مخزون الأصناف التالية أثناء المعالجة (استهلكه طلب متزامن آخر): ${raceFailures.join('، ')}. أعد المحاولة.`,
            raceFailures.map((tradeName) => ({ barcode: '', tradeName, missing: 0 }))
        );
    }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    // يُرفض كل الأدوار غير WAREHOUSE هنا (حتى SUPER_ADMIN) — الصيدلية لا تصل لهذا المسار إطلاقاً.
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canShipOrders');
        if (!gate.ok) return gate.response;

        const body = await req.json();
        const status = body?.status;
        const deliveryNote: string | undefined =
            typeof body?.deliveryNote === 'string' && body.deliveryNote.trim() ? body.deliveryNote : undefined;

        // اتحاد مغلق: فقط SHIPPED/DELIVERED مسموحان هنا — انتقالات الصيدلية
        // (APPROVED/REJECTED/CANCELLED) تبقى خارج متناول المذخر تماماً.
        if (!ALLOWED_STATUSES.includes(status)) {
            return NextResponse.json({ error: 'status يجب أن يكون SHIPPED أو DELIVERED' }, { status: 400 });
        }

        // الطلب يجب أن يخص مذخر هذا الحساب فقط — لا يمكن لمذخر التأثير على طلب مذخر آخر.
        // بنود الطلب + الباركود العالمي تُجلَب فقط عند الحاجة الفعلية (SHIPPED)
        // أدناه عبر إعادة استعلام محدودة كي لا يُثقَل الانتقال DELIVERED بحمل لا يلزمه.
        const order = await prisma.warehouseOrder.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            select: { id: true, status: true, orderNumber: true, branchId: true },
        });
        if (!order) {
            return NextResponse.json({ error: 'الطلب غير موجود في صندوق مذخرك' }, { status: 404 });
        }

        assertTransition(order.status as any, status); // يرمي برسالة عربية إن كان الانتقال غير شرعي

        // الخصم يفعَّل فقط عند APPROVED → SHIPPED تحديداً — ليس عند SHIPPED → DELIVERED
        // (الشحن الفعلي/إخراج المخزون يحدث لحظة الشحن، لا لحظة التسليم).
        const isShippingTransition = order.status === 'APPROVED' && status === 'SHIPPED';

        const updated = await prisma.$transaction(async (tx) => {
            await lockWarehouseOrder(tx, order.id, order.status);
            if (isShippingTransition) {
                const orderWithItems = await tx.warehouseOrder.findUniqueOrThrow({
                    where: { id: order.id },
                    select: {
                        items: {
                            select: {
                                quantity: true,
                                unitPrice: true,
                                quotedPrice: true,
                                quotedQuantity: true,
                                status: true,
                                bonusQuantity: true,
                                drug: { select: { barcode: true, tradeName: true } },
                            },
                        },
                    },
                });

                await deductStockForShipment(
                    tx,
                    ctx.warehouseId,
                    order.id,
                    orderWithItems.items,
                    ctx.user.name ?? ctx.user.email ?? null
                );
            }

            // حارس تزامن: التحديث مشروط بأن تبقى حالة الطلب كما قرأناها خارج
            // المعاملة (order.status) — طلبان متزامنان لنفس PATCH (نقرة مزدوجة،
            // إعادة محاولة العميل بعد مهلة) كلاهما يريان APPROVED قبل الدخول،
            // فبلا هذا الحارس كلاهما يخصم المخزون ويكتب SHIPPED بلا أي خطأ ظاهر
            // (double-ship/double-deduct صامت). الفائز الأول يُحدِّث فعلياً
            // (count=1)؛ الثاني يجد الحالة قد تغيّرت فعلاً (count=0) فيرمي —
            // فتتراجع معاملته **كاملة** بما فيها أي خصم مخزون طبّقه للتو.
            const changed = await tx.warehouseOrder.updateMany({
                where: { id: order.id, status: order.status },
                data: { status },
            });
            if (changed.count !== 1) {
                throw new Error(
                    `انتقال غير شرعي لحالة طلب المذخر: تغيّرت حالة الطلب أثناء المعالجة (طلب متزامن آخر سبقه) — كانت "${order.status}" ومطلوب الانتقال إلى "${status}".`
                );
            }
            const u = await tx.warehouseOrder.findUniqueOrThrow({ where: { id: order.id } });

            await tx.warehouseOrderEvent.create({
                data: {
                    orderId: order.id,
                    actorType: 'WAREHOUSE',
                    actorName: ctx.user.name ?? ctx.user.email ?? null,
                    type: status,
                    payload: deliveryNote ? { deliveryNote } : undefined,
                },
            });

            return u;
        });

        await sendAndPersistNotification({
            type: 'SYSTEM',
            branchId: order.branchId,
            title: status === 'SHIPPED' ? 'طلبك في طريقه إليك' : 'تم تسليم طلب المذخر',
            body:
                status === 'SHIPPED'
                    ? `سجّل المذخر شحن الطلب ${order.orderNumber ?? ''}.`
                    : `سجّل المذخر تسليم الطلب ${order.orderNumber ?? ''}.`,
            data: {
                kind: 'WAREHOUSE_ORDER',
                orderId: order.id,
                orderNumber: order.orderNumber,
                status,
            },
        });

        return NextResponse.json({ order: updated });
    } catch (e: any) {
        if (e instanceof StockShortfallError) {
            return NextResponse.json({ error: e.message, shortfalls: e.shortfalls }, { status: 409 });
        }
        if (e?.message?.includes('انتقال غير شرعي')) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        console.error('warehouse-portal shipping PATCH error:', e);
        return NextResponse.json({ error: 'فشل في تحديث حالة الشحن' }, { status: 500 });
    }
}
