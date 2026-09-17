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
import { decideMirrorSupplier, buildDraftPurchasePlan, type DraftPurchaseItem } from '@/app/lib/warehouse-purchase-bridge';
import { effectiveLine } from '@/app/lib/warehouse-quote';
import { assertTransition } from '@/app/lib/warehouse-order-state';
import { computeDueDate, checkCreditLimit } from '@/app/lib/warehouse-accounts';
import { notifyWarehouseUsers } from '@/app/lib/notifications/notificationTriggers';

type Action = 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** رفض ائتماني عند الاعتماد — يُترجم إلى 403 في catch أدناه. */
class CreditRejectedError extends Error {}

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

        // الاعتماد: بنود فاتورة الشراء من العرض النهائي — عبر effectiveLine()، مصدر
        // الحقيقة الوحيد المشترك مع مسار إجمالي عرض السعر. الأصناف النافدة (quantity=0
        // دائماً لها) تُستبعد هنا قبل الوصول لـ buildDraftPurchasePlan حتى لا تُسجَّل
        // كأخطاء "كمية غير صالحة" رغم كونها استبعاداً متعمَّداً وليس خطأ إدخال.
        const draftItems: DraftPurchaseItem[] = order.items
            .map((it) => {
                const eff = effectiveLine({
                    status: it.status,
                    quantity: it.quantity,
                    quotedQuantity: it.quotedQuantity,
                    unitPrice: it.unitPrice,
                    quotedPrice: it.quotedPrice,
                    // requestedPrice غير مُمرَّر عمداً — effectiveLine لا يستخدمه أصلاً.
                });
                // ميزة البونص: bonusQuantity يمرّ بلا تعديل — buildDraftPurchasePlan
                // هو من يقرر كيف يُبنى منه سطر PurchaseItem منفصل بكلفة صفر (لا
                // حساب هنا). سطر OUT_OF_STOCK (eff.quantity = 0) يُستبعَد بالكامل
                // أدناه قبل الوصول لـ buildDraftPurchasePlan — فبونصه العالق (إن
                // وُجد) لا يُفوتَر ولا يُسلَّم أبداً، اتساقاً مع خصم المخزون.
                return { drugId: it.drugId, quantity: eff.quantity, effectivePrice: eff.unitPrice, bonusQuantity: it.bonusQuantity };
            })
            .filter((it) => it.quantity > 0);

        if (draftItems.length === 0) {
            return NextResponse.json(
                {
                    error: 'كل أصناف هذا الطلب نافدة لدى المذخر — لا يوجد ما يمكن اعتماده أو فوترته. الرجاء رفض العرض بدلاً من اعتماده.',
                    code: 'ALL_ITEMS_OUT_OF_STOCK',
                },
                { status: 400 }
            );
        }

        const plan = buildDraftPurchasePlan(draftItems);
        if (!plan.ok) {
            return NextResponse.json(
                { error: 'تعذر بناء فاتورة الشراء من العرض', details: plan.errors },
                { status: 400 }
            );
        }

        // المورد المرآة: قرار نقّي + إنشاء آمن ضد التسابق (P2002 → إعادة جلب).
        const existingMirror = tenantCtx.organizationId
            ? await prisma.supplier.findFirst({
                  where: { warehouseId: order.warehouseId, organizationId: tenantCtx.organizationId },
                  select: { id: true },
              })
            : null;

        const decision = decideMirrorSupplier({
            existingSupplier: existingMirror,
            organizationId: tenantCtx.organizationId ?? null,
        });

        if (decision.action === 'BLOCKED_NO_ORG') {
            return NextResponse.json(
                { error: 'لا يمكن اعتماد الطلب: الحساب غير مرتبط بمنظمة لإنشاء مورد للمذخر.' },
                { status: 403 }
            );
        }

        const approvedAt = new Date();

        const updated = await prisma.$transaction(async (tx) => {
            await lockWarehouseOrder(tx, order.id, order.status);
            let supplierId: string;
            let organizationId: string;

            if (decision.action === 'USE') {
                supplierId = decision.supplierId!;
                // USE فقط عندما وُجد مورد مرآة موجود، وهذا لا يحدث إلا إن كان
                // tenantCtx.organizationId صالحاً أصلاً (existingMirror أعلاه لا
                // يُستعلَم عنه إلا حين يكون هذا الحقل حقيقياً) — نفس الضمان
                // المنطقي الذي يستند إليه decision.supplierId! في السطر أعلاه.
                organizationId = tenantCtx.organizationId!;
            } else {
                // CREATE: نحتاج اسم المذخر + الفرع — جلب داخل المعاملة.
                const [warehouse, orderWithBranch] = await Promise.all([
                    tx.warehouse.findUnique({ where: { id: order.warehouseId }, select: { name: true } }),
                    tx.warehouseOrder.findUnique({
                        where: { id: order.id },
                        select: { branch: { select: { organizationId: true } } },
                    }),
                ]);
                const orgId = orderWithBranch?.branch.organizationId ?? null;
                if (!orgId) {
                    throw new Error('NO_ORG');
                }
                const mirror = await tx.supplier.create({
                    data: {
                        name: `مذخر على المنصة: ${warehouse?.name ?? order.warehouseId}`,
                        warehouseId: order.warehouseId,
                        organizationId: orgId,
                    },
                });
                supplierId = mirror.id;
                organizationId = orgId;
            }

            // Phase 2: العلاقة التجارية (WarehouseCustomer) — تُنشأ تلقائياً عند أول
            // تعامل بين هذا المذخر وهذه الصيدلية، بنفس نمط المورد المرآة أعلاه
            // (بحث ثم إنشاء؛ التسابق يُحل عبر @@unique([warehouseId, organizationId])
            // + معالجة P2002 في catch أدناه). القيم الافتراضية (بلا حد ائتماني،
            // نقدي بلا مهلة) تُطبَّق من أول فاتورة حتى يضبطها مالك المذخر لاحقاً.
            let customer = await tx.warehouseCustomer.findUnique({
                where: { warehouseId_organizationId: { warehouseId: order.warehouseId, organizationId } },
            });
            if (!customer) {
                customer = await tx.warehouseCustomer.create({
                    data: { warehouseId: order.warehouseId, organizationId },
                });
            }

            await tx.$queryRaw`SELECT "id" FROM "WarehouseCustomer" WHERE "id" = ${customer.id} FOR UPDATE`;
            customer = await tx.warehouseCustomer.findUniqueOrThrow({ where: { id: customer.id } });
            const purchase = await tx.purchase.create({
                data: {
                    branchId: order.branchId,
                    supplierId,
                    total: plan.total,
                    status: 'PENDING',
                    items: {
                        create: plan.items.map((i) => ({
                            drugId: i.drugId,
                            quantity: i.quantity,
                            cost: i.cost,
                        })),
                    },
                },
            });

            // Phase 2: فاتورة المذخر على هذه الصيدلية. total = plan.total بالضبط —
            // نفس المتغيّر المُستخدَم لإجمالي Purchase أعلاه حرفياً، وليس محسوباً من
            // جديد بقاعدة مختلفة؛ هذا هو الثابت الذي يبقي فاتورة الشراء (جانب
            // الصيدلية) وفاتورة المذخر (جانب المذخر) متفقتين ماليّاً دوماً.
            //
            // رقم الفاتورة: نفس نمط orderNumber الآمن ضد السباق في
            // app/api/warehouses/orders/route.ts (طابع زمني base-36 + محاولات
            // فحص تفرّد + فشل صريح بدل مرور رقم null بصمت — لا نكرر خطأ "!" القديم).
            let invoiceNumber: string | null = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                const candidate = `WI-${Date.now().toString(36).toUpperCase()}${attempt ? `-${attempt}` : ''}`;
                const exists = await tx.warehouseInvoice.findUnique({ where: { invoiceNumber: candidate } });
                if (!exists) {
                    invoiceNumber = candidate;
                    break;
                }
            }
            if (invoiceNumber === null) {
                throw new Error('WI_NUMBER_GENERATION_FAILED');
            }

            // orderId فريد على WarehouseInvoice: لو دخل طلبان متزامنان هذه المعاملة
            // معاً بنفس order.id (كلاهما قرأ الحالة QUOTED قبل أن يُحدِّث أيّهما)،
            // فإن create الثاني هنا يضرب قيد التفرد على orderId ويُفشل معاملته
            // بالكامل (Purchase/customer/order-update معه) — لا فاتورة مكرَّرة ولا
            // Purchase يتيمة من الخاسر. catch أدناه يميّز هذه الحالة تحديداً.
            // حدّ الائتمان يُفحص هنا أيضاً، لا عند إنشاء الطلب فقط: عند الإنشاء
            // يكون unitPrice غالباً 0 (السعر يُحسم عند التسعير)، فيُفحص الحدّ ضد
            // إجمالي صفري ولا يمنع شيئاً أبداً. الاعتماد هو لحظة الالتزام الحقيقي
            // وفيه plan.total معروف — فهنا يبيت الفحص ذا معنى.
            if (customer.isBlocked) {
                throw new CreditRejectedError(
                    'هذا المذخر أوقف التعامل مع صيدليتك — لا يمكن اعتماد الطلب.'
                );
            }
            if (customer.creditLimit > 0) {
                const openInvoices = await tx.warehouseInvoice.findMany({
                    where: {
                        warehouseId: order.warehouseId,
                        organizationId,
                        status: { in: ['UNPAID', 'PARTIAL'] },
                    },
                    select: { total: true, paidAmount: true },
                });
                const outstanding = openInvoices.reduce(
                    (sum, inv) => sum + Math.max(inv.total - inv.paidAmount, 0),
                    0
                );
                const credit = checkCreditLimit({
                    creditLimit: customer.creditLimit,
                    outstanding,
                    newOrderTotal: plan.total,
                });
                if (!credit.ok) {
                    throw new CreditRejectedError(credit.error);
                }
            }

            const invoice = await tx.warehouseInvoice.create({
                data: {
                    warehouseId: order.warehouseId,
                    organizationId,
                    orderId: order.id,
                    invoiceNumber,
                    total: plan.total,
                    dueAt: computeDueDate(approvedAt, customer.paymentTermDays),
                },
            });

            const u = await tx.warehouseOrder.update({ where: { id: order.id }, data: { status: 'APPROVED' } });

            await tx.warehouseOrderEvent.create({
                data: {
                    orderId: order.id,
                    actorType: 'PHARMACY',
                    actorName: tenantCtx.user.name ?? tenantCtx.user.email ?? null,
                    type: 'APPROVED',
                    payload: { purchaseId: purchase.id, supplierId, total: plan.total, invoiceId: invoice.id, invoiceNumber },
                },
            });

            return { order: u, purchaseId: purchase.id, invoiceId: invoice.id };
        });

        await notifyWarehouseUsers({
            warehouseId: order.warehouseId,
            title: 'تم اعتماد طلب المذخر',
            body: `اعتمدت الصيدلية عرض السعر للطلب ${order.orderNumber ?? ''}. يمكنك تجهيز الشحن الآن.`,
            data: { orderId: order.id, orderNumber: order.orderNumber, status: 'APPROVED' },
        });

        return NextResponse.json({ order: updated.order, purchaseId: updated.purchaseId, invoiceId: updated.invoiceId });
    } catch (e: any) {
        if (e instanceof CreditRejectedError) {
            return NextResponse.json({ error: e.message, code: 'CREDIT_LIMIT' }, { status: 403 });
        }
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
