export const dynamic = 'force-dynamic';

// المرحلة 3 من ميزة المذاخر: صندوق طلبات بوابة المذخر.
// الحماية: getWarehouseContext() يرفض أي طالب ليس WAREHOUSE بحساب مذخر صالح
// (مسارات /api/warehouse-portal/* لا تغطيها authorized() — كل مسار يحمي نفسه).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { lockWarehouseOrder } from '@/app/lib/warehouse-order-lock';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { sendAndPersistNotification } from '@/app/lib/notifications/notificationTriggers';
import { warehouseInboxQuery } from '@/app/lib/warehouse-order-query';

// GET: طلبات مذخري — فلترة بالحالة، مع الأصناف وسجل الأحداث.
export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewOrders');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        let query;
        try { query = warehouseInboxQuery(searchParams.get('status'), searchParams.get('take')); }
        catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }

        const orders = await prisma.warehouseOrder.findMany({
            where: {
                warehouseId: ctx.warehouseId,
                // الطلبات في DRAFT لم تُرسل بعد — لا تظهر للمذخر إطلاقاً.
                status: query.status,
            },
            include: {
                // العلامة المميِّزة للطلب اسم الصيدلية (organization) لا الفرع وحده:
                // كل المؤسسات في الإنتاج تسمّي فرعها الافتراضي «الفرع الرئيسي»،
                // فاسم الفرع وحده لا يميّز عميلاً عن آخر — انظر OrdersClient.tsx.
                branch: { select: { name: true, organization: { select: { name: true } } } },
                items: {
                    include: { drug: { select: { tradeName: true, barcode: true } } },
                },
                events: { orderBy: { createdAt: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
            take: query.take,
        });

        return NextResponse.json({ orders });
    } catch (e: any) {
        console.error('warehouse-portal orders GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب طلبات المذخر' }, { status: 500 });
    }
}

// POST: بدء مراجعة طلب — SENT → UNDER_REVIEW (يقرر المذخر أنه بدأ المعالجة).
// Phase 3: بدء المراجعة هو الخطوة الأولى من دورة التسعير/المراجعة، فيتطلب
// canQuoteOrders — نفس صلاحية مسار quote أدناه.
export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canQuoteOrders');
        if (!gate.ok) return gate.response;

        const body = await req.json();
        const orderId: string | undefined = body?.orderId;
        if (!orderId) {
            return NextResponse.json({ error: 'orderId مطلوب' }, { status: 400 });
        }

        const order = await prisma.warehouseOrder.findFirst({
            where: { id: orderId, warehouseId: ctx.warehouseId },
            select: { id: true, status: true, orderNumber: true, branchId: true },
        });
        if (!order) {
            return NextResponse.json({ error: 'الطلب غير موجود في صندوق مذخرك' }, { status: 404 });
        }

        const { assertTransition } = await import('@/app/lib/warehouse-order-state');
        assertTransition(order.status as any, 'UNDER_REVIEW');

        const updated = await prisma.$transaction(async (tx) => {
            await lockWarehouseOrder(tx, order.id, order.status);
            const u = await tx.warehouseOrder.update({
                where: { id: order.id },
                data: { status: 'UNDER_REVIEW' },
            });
            await tx.warehouseOrderEvent.create({
                data: {
                    orderId: order.id,
                    actorType: 'WAREHOUSE',
                    actorName: ctx.user.name ?? ctx.user.email ?? null,
                    type: 'UNDER_REVIEW',
                },
            });
            return u;
        });

        await sendAndPersistNotification({
            type: 'SYSTEM',
            branchId: order.branchId,
            title: 'المذخر بدأ مراجعة الطلب',
            body: `بدأ المذخر مراجعة طلبك ${order.orderNumber ?? ''}.`,
            data: {
                kind: 'WAREHOUSE_ORDER',
                orderId: order.id,
                orderNumber: order.orderNumber,
                status: 'UNDER_REVIEW',
            },
        });

        return NextResponse.json({ order: updated });
    } catch (e: any) {
        if (e?.message?.includes('انتقال غير شرعي')) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        console.error('warehouse-portal orders POST error:', e);
        return NextResponse.json({ error: 'فشل في تحديث حالة الطلب' }, { status: 500 });
    }
}
