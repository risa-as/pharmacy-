export const dynamic = 'force-dynamic';

// المرحلة 3 من ميزة المذاخر: شاشة التسعير/المراجعة — قلب دورة التفاوض.
// المذخر يحكم على كل صنف (متوفر/جزئي/نافد + السعر النهائي) ثم يرسل العرض (QUOTED).
// كل القواعد الحسابية والشرعية تمر عبر buildQuoteDecision() وassertTransition().
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { lockWarehouseOrder } from '@/app/lib/warehouse-order-lock';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { buildQuoteDecision, effectiveLine, shouldAutoApprove, validateQuoteBatchInfo, type QuoteItemInput } from '@/app/lib/warehouse-quote';
import { assertTransition } from '@/app/lib/warehouse-order-state';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { validateBonus } from '@/app/lib/warehouse-bonus';
import { sendAndPersistNotification } from '@/app/lib/notifications/notificationTriggers';
// مرجع الشحنة المولَّد آلياً (قرار صاحب النظام 2026-09): «رقم الدفعة» لم يعد
// حقلاً يكتبه المذخر — يُصدره الخادم هنا فقط، بنفس القاعدة الحتمية التي
// تعرضها الواجهة مسبقاً (انظر تعليق الملف في shipment-ref.ts).
import { computeShipmentRefs } from '@/app/lib/shipment-ref';
// الاعتماد الآلي (قرار صاحب النظام 2026-09): حين يطابق العرض طلب الصيدلية
// تماماً لا داعٍ لضغطة اعتماد بشرية — انظر shouldAutoApprove أعلاه وتعليق
// الاستدعاء أدناه لقواعد الأمان غير القابلة للتفاوض.
import { approveWarehouseOrder } from '@/app/lib/warehouse-order-approval';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canQuoteOrders');
        if (!gate.ok) return gate.response;

        const body = await req.json();
        const items: QuoteItemInput[] | undefined = body?.items;
        const notes: string | null | undefined = body?.notes;

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'items مطلوبة — الحكم على كل أصناف الطلب' }, { status: 400 });
        }

        // الطلب يجب أن يخص مذخر هذا الحساب، وأن يكون قابلاً للمراجعة.
        const order = await prisma.warehouseOrder.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            select: { id: true, status: true, orderNumber: true, branchId: true },
        });
        if (!order) {
            return NextResponse.json({ error: 'الطلب غير موجود في صندوق مذخرك' }, { status: 404 });
        }

        assertTransition(order.status as any, 'QUOTED'); // يرمي برسالة عربية إن كان الطلب نهائياً/مشحوناً

        const dbItems = await prisma.warehouseOrderItem.findMany({
            where: { warehouseOrderId: order.id },
            select: { id: true, quantity: true, unitPrice: true },
        });

        const decision = buildQuoteDecision(items, dbItems.map((i) => ({
            itemId: i.id,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
        })));

        if (!decision.ok) {
            return NextResponse.json({ error: 'مراجعة غير مكتملة', details: decision.errors }, { status: 400 });
        }

        // ميزة البونص: تحقّق منفصل عن buildQuoteDecision (البونص لا يدخل حسابها
        // إطلاقاً — انظر تعليق QuoteItemInput.bonusQuantity). صنف OUT_OF_STOCK
        // يُتجاهَل هنا (بونصه يُصفَّر لاحقاً دائماً بصرف النظر عمّا أُرسل، تماماً
        // كما يُصفَّر quotedPrice له)، فلا حاجة للتحقق من صحة رقم لن يُخزَّن أصلاً.
        // الكمية المباعة المرجعية لكل صنف: PARTIAL → quotedQuantity المُرسَلة،
        // وإلا (AVAILABLE/REQUESTED) → الكمية الأصلية المطلوبة (ctx.quantity).
        const dbItemsById = new Map(dbItems.map((i) => [i.id, i]));
        const bonusErrors: string[] = [];
        for (const input of items) {
            if (input.status === 'OUT_OF_STOCK') continue;
            const bonusQuantity = input.bonusQuantity ?? 0;
            if (bonusQuantity === 0) continue;

            const ctx = dbItemsById.get(input.itemId);
            if (!ctx) continue; // مكرر/غريب — decision أعلاه رفضه ورسالته موجودة أصلاً

            const soldQuantity = input.status === 'PARTIAL' ? (input.quotedQuantity ?? 0) : ctx.quantity;
            const check = validateBonus({ soldQuantity, bonusQuantity });
            if (!check.ok) {
                bonusErrors.push(`الصنف ${input.itemId}: ${check.error}`);
            }
        }
        if (bonusErrors.length > 0) {
            return NextResponse.json({ error: 'بونص غير صالح', details: bonusErrors }, { status: 400 });
        }

        // ميزة نقل تاريخ الانتهاء عند التسعير: تحقّق منفصل بنفس نمط تحقّق
        // البونص أعلاه (بلا دخول effectiveLine/buildQuoteDecision — انظر
        // تعليق QuoteItemInput.expiryDate). صنف OUT_OF_STOCK يُتجاهَل هنا لأن
        // الحقل يُصفَّر له لاحقاً دائماً بصرف النظر عمّا أُرسل، تماماً كما
        // quotedPrice/bonusQuantity. اختياري تماماً — مذخر لا يرسل تاريخاً
        // يمرّ بلا أي رفض.
        //
        // batchNumber لم يعد يُقرَأ من body إطلاقاً (قرار صاحب النظام 2026-09):
        // لم يعد حقلاً يكتبه المذخر، بل يُصدره الخادم آلياً أدناه عبر
        // computeShipmentRefs — العميل لا يملك أي وسيلة للتأثير على القيمة
        // المخزَّنة فعلاً. نستدعي validateQuoteBatchInfo بلا batchNumber قصداً
        // فيبقى تحقّق تاريخ الانتهاء وحده يعمل دون تغيير.
        const expiryByItem = new Map<string, Date | null>();
        const batchErrors: string[] = [];
        for (const input of items) {
            if (input.status === 'OUT_OF_STOCK') continue;
            const check = validateQuoteBatchInfo({ expiryDate: input.expiryDate });
            if (!check.ok) {
                batchErrors.push(`الصنف ${input.itemId}: ${check.error}`);
                continue;
            }
            expiryByItem.set(input.itemId, check.expiryDate);
        }
        if (batchErrors.length > 0) {
            return NextResponse.json({ error: 'بيانات دفعة غير صالحة', details: batchErrors }, { status: 400 });
        }

        // مرجع الشحنة يُحسَب لكل أصناف الطلب (dbItems الكاملة لا items المُرسَلة
        // فقط) بترتيب مستقر حسب itemId — انظر تعليق computeShipmentOrdinals:
        // نفس القاعدة التي حسبتها الواجهة للعرض المسبق قبل الحفظ، فتتطابق
        // القيمتان حرفياً. order.orderNumber قد يكون null دفاعياً (طلب هاتفي
        // قديم بلا رقم؟) — computeShipmentRefs يتعامل معه بأمان (انظر الملف).
        const shipmentRefs = computeShipmentRefs(order.orderNumber, dbItems.map((i) => i.id));

        // تكتب فقط الأصناف التي حُكم عليها فعلاً — OUT_OF_STOCK يبقي السعر القديم كما هو
        // (لا يعيده المذخر) لكن إجمالي الطلب النهائي محسوب من العرض الصحيح أدناه.
        const byId = new Map(Object.entries(decision.lineTotals));
        const updated = await prisma.$transaction(async (tx) => {
            await lockWarehouseOrder(tx, order.id, order.status);
            for (const input of items) {
                const lineTotal = byId.get(input.itemId);
                if (lineTotal === undefined) continue; // مكرر/غريب — القرار رفضه أصلاً

                const base = {
                    status: input.status as any,
                    note: input.note ?? null,
                    quotedPrice:
                        input.status === 'OUT_OF_STOCK' ? null : (input.quotedPrice ?? null),
                    quotedQuantity:
                        input.status === 'PARTIAL' ? (input.quotedQuantity ?? null) : null,
                    // ميزة البونص: صنف نافد يُصفَّر بونصه دائماً (نفس منطق quotedPrice
                    // أعلاه) — بصرف النظر عمّا أُرسل، تحقَّق منه بالأعلى أو لا.
                    bonusQuantity: input.status === 'OUT_OF_STOCK' ? 0 : (input.bonusQuantity ?? 0),
                    // ميزة نقل الدفعة/الانتهاء: صنف نافد يُخزَّن له null في كلا
                    // الحقلين دائماً — بلا شرط — بنفس انضباط quotedPrice/bonusQuantity
                    // أعلاه بالضبط لا يُباع شيء فلا معنى لدفعة/تاريخ انتهاء له.
                    // batchNumber: القيمة المولَّدة آلياً وحدها — لا قيمة من body
                    // إطلاقاً مهما أُرسلت (انظر تعليق استدعاء validateQuoteBatchInfo
                    // أعلاه). expiryDate يبقى الحقل الوحيد المُدخَل من المذخر —
                    // لا يُولَّد ولا يُخمَّن مطلقاً.
                    batchNumber: input.status === 'OUT_OF_STOCK' ? null : (shipmentRefs.get(input.itemId) ?? null),
                    expiryDate: input.status === 'OUT_OF_STOCK' ? null : (expiryByItem.get(input.itemId) ?? null),
                };

                await tx.warehouseOrderItem.update({
                    where: { id: input.itemId },
                    data: base,
                });
            }

            // الإجمالي النهائي يُحسب من قيم السطور الجديدة عبر effectiveLine() —
            // مصدر الحقيقة الوحيد المشترك مع مسار اعتماد فاتورة الشراء.
            let total = 0;
            const fresh = await tx.warehouseOrderItem.findMany({
                where: { warehouseOrderId: order.id },
                select: { id: true, status: true, quotedPrice: true, quantity: true, unitPrice: true, quotedQuantity: true },
            });
            for (const it of fresh) {
                total += effectiveLine(it).lineTotal;
            }
            const u = await tx.warehouseOrder.update({
                where: { id: order.id },
                data: {
                    status: 'QUOTED',
                    totalAmount: total,
                    ...(notes != null ? { notes } : {}),
                    // priceUnit لم يعد يُكتَب هنا: كل أسعار المذاخر أسعار باكيت
                    // (قرار صاحب النظام)، فالعمود يبقى كما هو (NULL) — انظر
                    // pack-units.ts وتعليق العمود في schema.prisma.
                },
            });

            await tx.warehouseOrderEvent.create({
                data: {
                    orderId: order.id,
                    actorType: 'WAREHOUSE',
                    actorName: ctx.user.name ?? ctx.user.email ?? null,
                    type: 'QUOTED',
                    payload: {
                        available: decision.summary.available,
                        partial: decision.summary.partial,
                        outOfStock: decision.summary.outOfStock,
                        changedPrices: decision.summary.changedPrices,
                        total,
                    },
                },
            });

            return u;
        });

        await sendAndPersistNotification({
            type: 'SYSTEM',
            branchId: order.branchId,
            title: 'عرض سعر المذخر جاهز',
            body: `أرسل المذخر عرض السعر للطلب ${order.orderNumber ?? ''}.`,
            data: {
                kind: 'WAREHOUSE_ORDER',
                orderId: order.id,
                orderNumber: order.orderNumber,
                status: 'QUOTED',
            },
        });

        // ── الاعتماد الآلي: بعد التزام معاملة العرض أعلاه، لا داخلها ──────────
        // قاعدتا أمان غير قابلتين للتفاوض:
        //  1) معاملة منفصلة لاحقة — فشل الاعتماد الآلي يجب ألا يُسقط عرضاً
        //     نجح تسجيله بالفعل (لو كان داخل نفس معاملة العرض لتراجع الاثنان معاً).
        //  2) لا يمكن للاعتماد الآلي أن يُفشل طلب المذخر أبداً: أي رفض تجاري
        //     (ok:false — رفض ائتماني، عدد أشرطة غير محسوم...) أو استثناء غير
        //     متوقع يُسجَّل بـconsole.error ويُترك الطلب QUOTED، وتُعاد استجابة
        //     العرض الناجحة العادية تماماً؛ الصيدلية تعتمد يدوياً كما اليوم.
        // judgedItemCount = dbItems.length لا items.length: dbItems هو المجموع
        // الكامل الذي تحقّقت buildQuoteDecision من تغطيته حكماً واحداً لكل
        // صنف (decision.ok المتحقَّق أعلاه يضمن ذلك)، فهو مصدر العدّ الموثوق.
        let autoApproved = false;
        let autoApproveReason: string | undefined;

        if (shouldAutoApprove(decision.summary, dbItems.length)) {
            try {
                const outcome = await approveWarehouseOrder({
                    orderId: order.id,
                    actorType: 'SYSTEM',
                    actorName: 'اعتماد آلي — عرض المذخر طابق طلب الصيدلية تماماً',
                });
                if (outcome.ok) {
                    autoApproved = true;
                } else {
                    autoApproveReason = outcome.message;
                    console.error('warehouse-portal quote: auto-approve declined:', outcome.code, outcome.message);
                }
            } catch (e) {
                console.error('warehouse-portal quote: auto-approve threw:', e);
                autoApproveReason = 'تعذّر الاعتماد الآلي لسبب غير متوقع — الطلب بانتظار اعتماد الصيدلية يدوياً.';
            }
        } else {
            autoApproveReason = 'العرض يختلف عن طلب الصيدلية (سعر متغيّر/كمية جزئية/نفاد) — بانتظار اعتماد الصيدلية يدوياً.';
        }

        // updated أعلاه ما زالت تحمل status: 'QUOTED' (لقطة معاملة العرض قبل
        // الاعتماد الآلي) — عند نجاح الاعتماد الآلي نعيد قراءة الطلب كي لا
        // تتناقض الاستجابة مع autoApproved: true (الحالة الحقيقية الآن APPROVED).
        // هذه القراءة الإضافية مُغلَّفة بحماية خاصة بها: فشلها لا يصح أن يحوّل
        // عرضاً/اعتماداً ناجحَين فعلياً إلى استجابة 500 (قاعدة الأمان 2 نفسها) —
        // نُرقِّع status محلياً بدل رمي الخطأ لأعلى إلى catch العام للراوت.
        let responseOrder = updated;
        if (autoApproved) {
            try {
                responseOrder = await prisma.warehouseOrder.findUniqueOrThrow({ where: { id: order.id } });
            } catch (e) {
                console.error('warehouse-portal quote: post-auto-approve refetch failed:', e);
                responseOrder = { ...updated, status: 'APPROVED' };
            }
        }

        return NextResponse.json({
            order: responseOrder,
            summary: decision.summary,
            autoApproved,
            ...(autoApproveReason ? { autoApproveReason } : {}),
        });
    } catch (e: any) {
        if (e?.message?.includes('انتقال غير شرعي')) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        console.error('warehouse-portal quote PATCH error:', e);
        return NextResponse.json({ error: 'فشل في إرسال العرض' }, { status: 500 });
    }
}
