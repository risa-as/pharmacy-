export const dynamic = 'force-dynamic';

// المرحلة 5 من ميزة المذاخر: جسر المشتريات — عند اعتماد الصيدلية للعرض (QUOTED→APPROVED)
// تُنشأ فاتورة شراء مسودة بنفس الأسعار المعتمدة، مع إنشاء/جلب **المورد المرآة**
// تلقائياً (مورد واحد لكل منظمة/مذخر — القيد الفريد في المخطط + قرار نقّي).
// الاستلام اللاحق يمر بالمسار العادي فيتضمن المورد على الدفعات (ميزة 007).
//
// Phase 2 (الحسابات والعملاء): نفس هذه المعاملة تُنشئ أيضاً WarehouseInvoice —
// فاتورة المذخر على هذه الصيدلية — بنفس plan.total المُستخدَم لفاتورة الشراء
// المسودة أعلاه بالضبط (مصدر واحد، لا يُعاد حسابه)، مع WarehouseCustomer يُنشأ
// تلقائياً إن لم يكن موجوداً (نفس نمط المورد المرآة) لتوفير شروط افتراضية
// (بلا حد ائتماني، نقدي) من أول تعامل.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { lockWarehouseOrder } from '@/app/lib/warehouse-order-lock';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { warehouseOrderScope } from '@/app/lib/warehouse-access';
import { assertTransition } from '@/app/lib/warehouse-order-state';
import { notifyWarehouseUsers } from '@/app/lib/notifications/notificationTriggers';
// منطق الاعتماد (بناء فاتورة الشراء المسودة، المورد المرآة، فاتورة المذخر،
// فحص حدّ الائتمان) استُخرج بالكامل إلى warehouse-order-approval.ts — نفس
// السلوك حرفياً، لكن قابل للاستدعاء أيضاً من مسار الاعتماد الآلي في
// app/api/warehouse-portal/orders/[id]/quote/route.ts (لا سياق صيدلية هناك).
import { approveWarehouseOrder } from '@/app/lib/warehouse-order-approval';

type Action = 'APPROVED' | 'REJECTED' | 'CANCELLED';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canCreatePurchase) return NextResponse.json({ error: 'ليس لديك صلاحية إدارة المشتريات.' }, { status: 403 });

        const body = await req.json();
        const action = body?.action as Action;
        const reason: string | null = typeof body?.reason === 'string' ? body.reason : null;

        if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(action)) {
            return NextResponse.json({ error: 'action غير صالح' }, { status: 400 });
        }

        const scope = warehouseOrderScope({
            role: tenantCtx.user.role,
            organizationId: tenantCtx.organizationId,
            branchId: tenantCtx.user.branchId,
        });
        if (!scope) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const order = await prisma.warehouseOrder.findFirst({
            where: { id: params.id, ...scope },
            include: {
                items: { select: { drugId: true, quantity: true, unitPrice: true, requestedPrice: true, quotedPrice: true, quotedQuantity: true, status: true, bonusQuantity: true } },
            },
        });
        if (!order) {
            return NextResponse.json({ error: 'الطلب غير موجود في نطاقك' }, { status: 404 });
        }

        assertTransition(order.status as any, action);

        // الجسر يعمل عند الاعتماد فقط — الرفض/الإلغاء حدث Timeline وحسب.
        if (action !== 'APPROVED') {
            // إلغاء طلب سبق اعتماده يترك فاتورة المذخر معلّقة UNPAID تتقادم في
            // الذمم للأبد. نُلغي الفاتورة معه — إلا إذا سُجّلت عليها دفعات، فعندها
            // الإلغاء قرار مالي (ردّ مبلغ/إشعار دائن) لا يصح إخفاؤه بتغيير حالة.
            const existingInvoice = await prisma.warehouseInvoice.findUnique({
                where: { orderId: order.id },
                select: { id: true, paidAmount: true, invoiceNumber: true },
            });
            if (action === 'CANCELLED' && existingInvoice && existingInvoice.paidAmount > 0) {
                return NextResponse.json(
                    {
                        error: `لا يمكن إلغاء الطلب: الفاتورة ${existingInvoice.invoiceNumber} سُجِّلت عليها دفعات (${existingInvoice.paidAmount}). يلزم تسوية المبلغ مع المذخر أولاً.`,
                        code: 'INVOICE_HAS_PAYMENTS',
                    },
                    { status: 409 }
                );
            }

            const updated = await prisma.$transaction(async (tx) => {
                await lockWarehouseOrder(tx, order.id, order.status);
                const u = await tx.warehouseOrder.update({ where: { id: order.id }, data: { status: action } });
                if (existingInvoice) {
                    const cancelled = await tx.warehouseInvoice.updateMany({
                        where: { id: existingInvoice.id, paidAmount: 0, status: { not: 'CANCELLED' } },
                        data: { status: 'CANCELLED' },
                    });
                    if (cancelled.count !== 1) throw new Error('انتقال غير شرعي: تغيرت الفاتورة أو سُجّلت عليها دفعة.');
                    const approved = await tx.warehouseOrderEvent.findFirst({
                        where: { orderId: order.id, type: 'APPROVED' }, orderBy: { createdAt: 'desc' },
                    });
                    const payload = approved?.payload as { purchaseId?: string } | null;
                    if (!payload?.purchaseId) throw new Error('انتقال غير شرعي: رابط فاتورة الشراء غير موجود؛ يلزم مراجعتها.');
                    const purchaseCancelled = await tx.purchase.updateMany({
                        where: { id: payload.purchaseId, branchId: order.branchId, status: 'PENDING', paidAmount: 0 },
                        data: { status: 'CANCELLED' },
                    });
                    if (purchaseCancelled.count !== 1) throw new Error('انتقال غير شرعي: تم استلام فاتورة الشراء أو سدادها؛ يلزم تسوية المرتجع.');
                }
                await tx.warehouseOrderEvent.create({
                    data: {
                        orderId: order.id,
                        actorType: 'PHARMACY',
                        actorName: tenantCtx.user.name ?? tenantCtx.user.email ?? null,
                        type: action,
                        payload: reason ? { reason } : undefined,
                    },
                });
                return u;
            });
            await notifyWarehouseUsers({
                warehouseId: order.warehouseId,
                title: action === 'REJECTED' ? 'تم رفض عرض السعر' : 'أُلغي طلب الصيدلية',
                body:
                    action === 'REJECTED'
                        ? `رفضت الصيدلية عرض السعر للطلب ${order.orderNumber ?? ''}.`
                        : `ألغت الصيدلية الطلب ${order.orderNumber ?? ''}.`,
                data: { orderId: order.id, orderNumber: order.orderNumber, status: action },
            });
            return NextResponse.json({ order: updated, purchaseId: null });
        }

        // الاعتماد: كل المنطق (effectiveLine، تحويل الباكيت↔الشريط، المورد
        // المرآة، حدّ الائتمان، فاتورة المذخر...) استُخرج إلى
        // approveWarehouseOrder() — يُستدعى أيضاً من مسار الاعتماد الآلي عند
        // تطابق العرض تماماً (quote/route.ts). لا يرمي أبداً للرفض التجاري —
        // يُرجع ApprovalOutcome، فنعيد بناء نفس شكل/كود/حالة الاستجابة الأصلي
        // بالضبط أدناه (عقد الواجهة الحالي — OrdersTrackClient.tsx — بلا تغيير).
        // حارس مُستبقى عمداً بعد الاستخراج: approveWarehouseOrder تشتق المنظمة من
        // order.branch.organizationId (وجب ذلك ليعمل الاعتماد الآلي من بوابة
        // المذخر حيث لا سياق صيدلية أصلاً). لكن warehouseOrderScope يعيد {} لـ
        // SUPER_ADMIN — أي كل الطلبات — فبلا هذا السطر يصير بوسع مدير المنصة بلا
        // منظمة أن يعتمد طلب أي صيدلية فينشئ عليها فاتورة وذمة، وهو ما كان
        // BLOCKED_NO_ORG يمنعه قبل الاستخراج. توسيع صلاحية كهذا لا يصح أن يتسرّب
        // كأثر جانبي لإعادة هيكلة؛ إن أُريد فليكن قراراً صريحاً.
        if (!tenantCtx.organizationId) {
            return NextResponse.json(
                { error: 'لا يمكن اعتماد الطلب: الحساب غير مرتبط بمنظمة لإنشاء مورد للمذخر.' },
                { status: 403 }
            );
        }

        const outcome = await approveWarehouseOrder({
            orderId: order.id,
            actorType: 'PHARMACY',
            actorName: tenantCtx.user.name ?? tenantCtx.user.email ?? null,
        });

        if (!outcome.ok) {
            // code يظهر فقط للحالات التي كانت تحمله أصلاً في الجسم الأصلي
            // (PACK_UNITS_UNRESOLVED، ALL_ITEMS_OUT_OF_STOCK، CREDIT_LIMIT)؛
            // البقية بلا code كما كانت تماماً (BLOCKED_NO_ORG، فشل بناء الخطة،
            // تسابق الفاتورة). details فقط حين وُجدت فعلياً على outcome.
            const body: Record<string, unknown> = { error: outcome.message };
            if (
                outcome.code === 'PACK_UNITS_UNRESOLVED' ||
                outcome.code === 'ALL_ITEMS_OUT_OF_STOCK' ||
                outcome.code === 'CREDIT_LIMIT'
            ) {
                body.code = outcome.code;
            }
            if (outcome.details) body.details = outcome.details;
            return NextResponse.json(body, { status: outcome.status });
        }

        // ApprovalOutcome لا يحمل صف الطلب نفسه عمداً (الدالة تُستدعى أيضاً من
        // مسار لا يحتاجه) — نجلبه هنا مرة واحدة رخيصة لإعادة نفس شكل الاستجابة
        // الأصلي {order, purchaseId, invoiceId} بحالته الطازجة بعد الاعتماد.
        const updatedOrder = await prisma.warehouseOrder.findUniqueOrThrow({ where: { id: order.id } });
        return NextResponse.json({
            order: updatedOrder,
            purchaseId: outcome.purchaseId,
            invoiceId: outcome.invoiceId,
        });
    } catch (e: any) {
        if (e?.message?.includes('انتقال غير شرعي')) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        if (e?.message === 'NO_ORG') {
            return NextResponse.json({ error: 'الفرع غير مرتبط بمنظمة — لا يمكن إنشاء مورد المرآة.' }, { status: 400 });
        }
        if (e?.message === 'WI_NUMBER_GENERATION_FAILED') {
            return NextResponse.json(
                { error: 'تعذّر توليد رقم فاتورة فريد بعد عدة محاولات — الرجاء إعادة المحاولة.' },
                { status: 503 }
            );
        }
        // سباق: قيد تفرّد ضُرب. نميّز orderId (اعتماد مزدوج متزامن لنفس الطلب —
        // فاتورة موجودة بالفعل من الطلب الفائز، لا حاجة لإعادة المحاولة) عن
        // (organizationId, warehouseId) على Supplier أو WarehouseCustomer (مورد
        // مرآة/عميل أُنشئ للتو من طلب آخر — تعيد المحاولة فتُستخدَم القيم الموجودة).
        if (e?.code === 'P2002') {
            // meta.target يختلف شكله بين إصدارات Prisma/محرّكات القواعد: أحياناً
            // مصفوفة أسماء أعمدة (['orderId'])، وأحياناً نص اسم القيد الكامل
            // ("WarehouseInvoice_orderId_key"). لا نراهن على شكل واحد — نحوّله
            // إلى نص ونبحث عن "orderId" فيه أياً كان الشكل. لو لم يُطابق أياً
            // منهما فالرسالة العامة أدناه تبقى صحيحة وآمنة (لا فاتورة مكرَّرة في
            // الحالتين، فقط الرسالة تبقى أعمّ).
            const rawTarget = e?.meta?.target;
            const targetStr = Array.isArray(rawTarget) ? rawTarget.join(',') : String(rawTarget ?? '');
            if (targetStr.includes('orderId')) {
                return NextResponse.json(
                    {
                        error: 'هذا الطلب اعتُمد للتو ضمن طلب متزامن آخر — الفاتورة موجودة بالفعل ولا حاجة لإعادة المحاولة.',
                    },
                    { status: 409 }
                );
            }
            return NextResponse.json(
                { error: 'المورد المرآة أو حساب العميل أُنشئ للتو من طلب آخر — أعد المحاولة وسيعاد استخدامه.' },
                { status: 409 }
            );
        }
        console.error('warehouse order decision error:', e);
        return NextResponse.json({ error: 'فشل في تنفيذ القرار' }, { status: 500 });
    }
}
