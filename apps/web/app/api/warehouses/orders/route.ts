export const dynamic = 'force-dynamic';

// المرحلة 4 من ميزة المذاخر: جانب الصيدلية — إنشاء الطلب المرسل للمذخر.
// يطوّر POST المرحلة 0: الأصناف تُطابق عبر الباركود على الصفوف العالمية
// (resolveToGlobalDrug) فيُكتب drugId العالمي في بند الطلب — فيفهمه الطرفان —
// وطلبPrice اختياري، والحالة الابتدائية SENT (لا DRAFT في هذا المسار)، مع
// حدث Timeline وأرقام طلبات آمنة ضد السباق (بدل عدّاد count+1).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { checkFeatureAccess } from '@/app/lib/saas-guards';
import { warehouseOrderScope, resolveOrderBranch } from '@/app/lib/warehouse-access';
import { GLOBAL_DRUG_SCOPE } from '@/app/lib/warehouse-catalog';
import { checkCreditLimit } from '@/app/lib/warehouse-accounts';
import { notifyWarehouseUsers } from '@/app/lib/notifications/notificationTriggers';
import { randomUUID, createHash } from 'node:crypto';
import { ORDER_TRANSITIONS, type OrderStatus } from '@/app/lib/warehouse-order-state';

export async function GET(req: NextRequest) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    if (!ctx.userPermissions.canViewSuppliers) return NextResponse.json({ error: 'غير مصرح بعرض المشتريات.' }, { status: 403 });
    const scope = warehouseOrderScope({ role: ctx.user.role, organizationId: ctx.organizationId, branchId: ctx.user.branchId });
    if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const status = req.nextUrl.searchParams.get('status');
    if (status && !Object.hasOwn(ORDER_TRANSITIONS, status)) return NextResponse.json({ error: 'حالة غير صالحة.' }, { status: 400 });
    const orders = await prisma.warehouseOrder.findMany({
        where: { AND: [scope, ...(status ? [{ status: status as OrderStatus }] : [])] },
        include: { warehouse: { select: { name: true } }, branch: { select: { name: true } }, items: { include: { drug: { select: { barcode: true, tradeName: true } } } }, events: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' }, take: 100,
    });
    return NextResponse.json({ orders });
}

// POST: إنشاء طلب لمذخر — { warehouseId, items: [{barcode|drugId, quantity, unitPrice?}], notes?, expectedDate?, branchId? }
export async function POST(req: NextRequest) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canCreatePurchase) return NextResponse.json({ error: 'ليس لديك صلاحية إنشاء المشتريات.' }, { status: 403 });

        if (!tenantCtx.organizationId && tenantCtx.user.role !== 'SUPER_ADMIN') {
            return NextResponse.json({ error: 'Organization not found' }, { status: 403 });
        }

        if (tenantCtx.organizationId) {
            const access = await checkFeatureAccess(tenantCtx.organizationId, 'warehouseManagement');
            if (!access.allowed) {
                return NextResponse.json(
                    {
                        error: 'إرسال طلبات للمذاخر متاح ضمن باقتك — أضف علم warehouseManagement للخطة أو أضفه للخطة الحالية.',
                        code: 'FEATURE_NOT_IN_PLAN',
                        requiredPlan: 'ENTERPRISE',
                    },
                    { status: 403 }
                );
            }
        }

        const body = await req.json();
        const { warehouseId, branchId: requestedBranchId, items, notes, expectedDate } = body;
        const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
        if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
            return NextResponse.json({ error: 'idempotencyKey مطلوب (16-128 رمزاً)' }, { status: 400 });
        }
        if (expectedDate && !Number.isFinite(new Date(expectedDate).getTime())) return NextResponse.json({ error: 'تاريخ التسليم غير صالح.' }, { status: 400 });

        if (!warehouseId || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'warehouseId و items مطلوبة' }, { status: 400 });
        }
        if (items.length > 100) {
            return NextResponse.json({ error: 'الحد الأقصى 100 صنف لكل طلب' }, { status: 400 });
        }

        // نفس حل الفرع المحصّن من المرحلة 0.
        const branchResolution = resolveOrderBranch(
            {
                role: tenantCtx.user.role,
                organizationId: tenantCtx.organizationId,
                branchId: tenantCtx.user.branchId,
            },
            requestedBranchId
        );
        if (!branchResolution) {
            return NextResponse.json({ error: 'branchId مطلوب' }, { status: 400 });
        }

        let branchId: string;
        if ('needsOrgBranchCheck' in branchResolution) {
            if (tenantCtx.user.role !== 'SUPER_ADMIN' && !tenantCtx.organizationId) {
                return NextResponse.json({ error: 'Organization not found for user' }, { status: 403 });
            }
            if (tenantCtx.user.role === 'SUPER_ADMIN') {
                const branch = await prisma.branch.findUnique({ where: { id: branchResolution.needsOrgBranchCheck } });
                if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 400 });
                branchId = branch.id;
            } else {
                const branch = await prisma.branch.findFirst({
                    where: { id: branchResolution.needsOrgBranchCheck, organizationId: tenantCtx.organizationId },
                });
                if (!branch) {
                    return NextResponse.json({ error: 'الفرع لا ينتمي لمؤسستك' }, { status: 403 });
                }
                branchId = branch.id;
            }
        } else {
            branchId = branchResolution.branchId;
        }

        const requestHash = createHash('sha256').update(JSON.stringify([
            warehouseId, branchId, notes ?? null, expectedDate ? new Date(expectedDate).toISOString() : null,
            items.map((item: any) => [item?.barcode ? String(item.barcode) : null, item?.barcode ? null : item?.drugId ?? null,
                Number(item?.quantity), Number(item?.unitPrice ?? 0)]),
        ])).digest('hex');
        const priorOrder = await prisma.warehouseOrder.findUnique({ where: { idempotencyKey }, include: { items: true, events: { where: { type: 'SENT' } } } });
        if (priorOrder) {
            if (priorOrder.warehouseId !== warehouseId || priorOrder.branchId !== branchId ||
                !priorOrder.events.some(event => (event.payload as any)?.requestHash === requestHash)) {
                return NextResponse.json({ error: 'مفتاح العملية مستخدم لعملية أخرى.' }, { status: 409 });
            }
            return NextResponse.json({ order: priorOrder, idempotentReplay: true }, { status: 200 });
        }

        const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
        if (!warehouse || !warehouse.isActive) {
            return NextResponse.json({ error: 'المذخر غير موجود أو غير مفعّل' }, { status: 400 });
        }

        // Phase 2 (الحسابات والعملاء): حظر الصيدلية أو تجاوز حدّ الائتمان يُرفضان
        // قبل أي كتابة. لا فحص إن لم توجد منظمة (SUPER_ADMIN بلا organizationId —
        // نفس استثناء فحص الميزة أعلاه) أو لم يوجد بعد صف WarehouseCustomer لهذا
        // الزوج (مذخر، منظمة) — أول تعامل بلا شروط بعد، فيُسمح دائماً؛ الصف يُنشأ
        // تلقائياً عند أول اعتماد (انظر app/api/warehouses/orders/[id]/route.ts).
        const warehouseCustomer = tenantCtx.organizationId
            ? await prisma.warehouseCustomer.findUnique({
                  where: { warehouseId_organizationId: { warehouseId, organizationId: tenantCtx.organizationId } },
                  select: { creditLimit: true, isBlocked: true },
              })
            : null;

        if (warehouseCustomer?.isBlocked) {
            return NextResponse.json(
                { error: 'هذا المذخر أوقف التعامل مع صيدليتك حالياً — تواصل معه مباشرة لمعرفة السبب.', code: 'WAREHOUSE_CUSTOMER_BLOCKED' },
                { status: 403 }
            );
        }

        // مطابقة الأصناف عبر الباركود على الصفوف العالمية — قبول drugId مباشرة
        // فقط إن كان فعلاً صفاً عالمياً (خيار الواجهة القديمة).
        const errors: Array<{ index: number; message: string }> = [];
        const resolvedItems: Array<{ drugId: string; quantity: number; unitPrice: number; requestedPrice: number | null }> = [];

        for (let i = 0; i < items.length; i++) {
            const it = items[i] ?? {};
            const quantity = Number(it.quantity);
            if (!Number.isSafeInteger(quantity) || quantity <= 0) {
                errors.push({ index: i, message: 'الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر.' });
                continue;
            }
            const unitPrice = it.unitPrice != null ? Number(it.unitPrice) : 0;
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                errors.push({ index: i, message: 'السعر غير صالح.' });
                continue;
            }

            let globalDrugId: string | null = null;
            if (it.barcode) {
                const barcode = String(it.barcode).trim();
                const matches = barcode ? await prisma.globalDrug.findMany({
                    where: { barcode, ...GLOBAL_DRUG_SCOPE }, select: { id: true }, take: 2,
                }) : [];
                if (matches.length !== 1) {
                    errors.push({ index: i, message: 'الباركود لا يطابق صنفاً عالمياً واحداً — راجع هوية الدواء.' });
                    continue;
                }
                globalDrugId = matches[0].id;
            } else if (it.drugId) {
                const g = await prisma.globalDrug.findFirst({
                    where: { id: String(it.drugId), organizationId: null, warehouseId: null },
                    select: { id: true },
                });
                if (!g) {
                    errors.push({ index: i, message: 'الصنف ليس عاماً — استخدم باركوده بدل معرّف نسختك المحلية.' });
                    continue;
                }
                globalDrugId = g.id;
            } else {
                errors.push({ index: i, message: 'كل صنف يتطلب باركوداً (أو معرّفاً عالمياً).' });
                continue;
            }

            if (resolvedItems.some(line => line.drugId === globalDrugId)) {
                errors.push({ index: i, message: 'الصنف نفسه مكرر في الطلب؛ اجمع كميته في سطر واحد.' });
                continue;
            }
            resolvedItems.push({
                drugId: globalDrugId,
                quantity,
                unitPrice,
                requestedPrice: unitPrice > 0 ? unitPrice : null,
            });
        }

        if (errors.length > 0) {
            return NextResponse.json(
                { error: 'بعض الأصناف غير قابلة للطلب', details: errors },
                { status: 400 }
            );
        }

        // رقم طلب آمن ضد السباق: عدة محاولات مع فحص التفرد بدل عدّاد عام.
        const totalAmount = resolvedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

        if (!Number.isFinite(totalAmount)) return NextResponse.json({ error: 'إجمالي الطلب غير صالح.' }, { status: 400 });

        // Phase 2: حدّ الائتمان — creditLimit <= 0 يعني بلا حد (checkCreditLimit
        // النقيّة تتولى هذا الشرط)، وإلا يُحسب القائم من فواتير هذه الصيدلية غير
        // المُلغاة/المسدَّدة بالكامل لدى هذا المذخر تحديداً (ليس كل الذمم لدى كل
        // المذاخر). المبلغ الظاهر للصيدلي في رسالة الرفض هو المتاح فعلياً، لا
        // تخمين — نفس رسالة checkCreditLimit حرفياً، بلا إعادة صياغة هنا.
        if (warehouseCustomer && warehouseCustomer.creditLimit > 0 && tenantCtx.organizationId) {
            const outstandingAgg = await prisma.warehouseInvoice.aggregate({
                where: {
                    warehouseId,
                    organizationId: tenantCtx.organizationId,
                    status: { in: ['UNPAID', 'PARTIAL'] },
                },
                _sum: { total: true, paidAmount: true },
            });
            const outstanding = (outstandingAgg._sum.total ?? 0) - (outstandingAgg._sum.paidAmount ?? 0);

            const creditCheck = checkCreditLimit({
                creditLimit: warehouseCustomer.creditLimit,
                outstanding,
                newOrderTotal: totalAmount,
            });
            if (!creditCheck.ok) {
                return NextResponse.json(
                    { error: creditCheck.error, code: 'CREDIT_LIMIT_EXCEEDED', available: creditCheck.available },
                    { status: 403 }
                );
            }
        }

        const outcome = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))::text`;
            const prior = await tx.warehouseOrder.findUnique({ where: { idempotencyKey }, include: { items: true, events: { where: { type: 'SENT' } } } });
            if (prior) {
                if (prior.warehouseId !== warehouseId || prior.branchId !== branchId ||
                    !prior.events.some(event => (event.payload as any)?.requestHash === requestHash)) {
                    throw new Error('IDEMPOTENCY_CONFLICT');
                }
                return { order: prior, idempotentReplay: true };
            }
            let orderNumber: string | null = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                const candidate = `WO-${randomUUID().toUpperCase()}`;
                const exists = await tx.warehouseOrder.findUnique({ where: { orderNumber: candidate } });
                if (!exists) {
                    orderNumber = candidate;
                    break;
                }
            }
            // كل المحاولات الخمس اصطدمت برقم موجود — orderNumber يبقى null، والعمود
            // اختياري (String?) رغم كونه فريداً، فبدون هذا الحارس كان Prisma سينشئ
            // طلباً بلا رقم بصمت (! كانت تكذب). نُفشل المعاملة بدل ذلك فتتراجع بالكامل.
            if (orderNumber === null) {
                throw new Error('WO_NUMBER_GENERATION_FAILED');
            }

            const created = await tx.warehouseOrder.create({
                data: {
                    warehouseId,
                    branchId,
                    idempotencyKey,
                    orderNumber,
                    status: 'SENT',
                    totalAmount,
                    notes: notes ?? null,
                    expectedDate: expectedDate ? new Date(expectedDate) : null,
                    items: {
                        create: resolvedItems.map((i) => ({
                            drugId: i.drugId,
                            quantity: i.quantity,
                            unitPrice: i.unitPrice,
                            requestedPrice: i.requestedPrice,
                        })),
                    },
                },
                include: { items: true },
            });

            await tx.warehouseOrderEvent.create({
                data: {
                    orderId: created.id,
                    actorType: 'PHARMACY',
                    actorName: tenantCtx.user.name ?? tenantCtx.user.email ?? null,
                    type: 'SENT',
                    payload: { itemCount: resolvedItems.length, totalAmount, requestHash },
                },
            });

            return { order: created, idempotentReplay: false };
        });

        const { order, idempotentReplay } = outcome;
        if (idempotentReplay) return NextResponse.json(outcome, { status: 200 });

        await notifyWarehouseUsers({
            warehouseId,
            title: 'طلب جديد من صيدلية',
            body: `وصل طلب ${order.orderNumber ?? ''} من صيدلية على المنصة.`,
            data: { orderId: order.id, orderNumber: order.orderNumber, status: 'SENT' },
        });

        return NextResponse.json({ order }, { status: 201 });
    } catch (e: any) {
        if (e?.message === 'IDEMPOTENCY_CONFLICT') {
            return NextResponse.json({ error: 'مفتاح العملية مستخدم لطلب مختلف.' }, { status: 409 });
        }
        if (e?.message === 'WO_NUMBER_GENERATION_FAILED') {
            return NextResponse.json(
                { error: 'تعذّر توليد رقم طلب فريد بعد عدة محاولات — الرجاء إعادة المحاولة.' },
                { status: 503 }
            );
        }
        // سباق نادر: طلبان في نفس المللي ثانية يجتازان فحص findUnique معاً بنفس
        // الرقم المرشّح، فيفشل create الثاني بقيد التفرد بدل تركه يظهر كـ 500 خام.
        if (e?.code === 'P2002') {
            return NextResponse.json(
                { error: 'الطلب موجود مسبقاً أو تعارض مفتاح العملية — أعد جلبه باستخدام idempotencyKey.' },
                { status: 409 }
            );
        }
        console.error('warehouse orders POST error:', e);
        return NextResponse.json({ error: 'فشل في إنشاء الطلب' }, { status: 500 });
    }
}
