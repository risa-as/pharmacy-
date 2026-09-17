export const dynamic = 'force-dynamic';

// المرحلة 3 من ميزة المذاخر: شاشة التسعير/المراجعة — قلب دورة التفاوض.
// المذخر يحكم على كل صنف (متوفر/جزئي/نافد + السعر النهائي) ثم يرسل العرض (QUOTED).
// كل القواعد الحسابية والشرعية تمر عبر buildQuoteDecision() وassertTransition().
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { lockWarehouseOrder } from '@/app/lib/warehouse-order-lock';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { buildQuoteDecision, effectiveLine, type QuoteItemInput } from '@/app/lib/warehouse-quote';
import { assertTransition } from '@/app/lib/warehouse-order-state';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { validateBonus } from '@/app/lib/warehouse-bonus';
import { sendAndPersistNotification } from '@/app/lib/notifications/notificationTriggers';

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

        return NextResponse.json({ order: updated, summary: decision.summary });
    } catch (e: any) {
        if (e?.message?.includes('انتقال غير شرعي')) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        console.error('warehouse-portal quote PATCH error:', e);
        return NextResponse.json({ error: 'فشل في إرسال العرض' }, { status: 500 });
    }
}
