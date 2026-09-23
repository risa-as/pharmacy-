export const dynamic = 'force-dynamic';

// طلب يدخله المذخر نيابةً عن صيدلية طلبت هاتفياً أو عبر واتساب
// (فحص 2026-09-17، فجوة G3).
//
// كانت الطلبات تُنشأ من جانب الصيدلية حصراً (POST /api/warehouses/orders)،
// و POST /api/warehouse-portal/orders هو «بدء المراجعة» لا الإنشاء — فالطلب
// الهاتفي، وهو الأشيع عملياً في العراق، لا مسار له إطلاقاً إلا البيع الميداني
// الذي يستلزم مندوباً ورصيد سيارة.
//
// **القرار المحوري: الطلب يُنشأ بحالة QUOTED لا APPROVED.**
// أي أن المذخر يُدخل الأصناف وأسعارها، ثم **الصيدلية تعتمد** من شاشتها كأي
// عرض سعر. سبب ذلك أن اعتماد الصيدلية هو الموضع الذي يجري فيه فحص حدّ
// الائتمان وتُنشأ فيه الفاتورة وتاريخ الاستحقاق
// (app/api/warehouses/orders/[id]/route.ts) — فإنشاء الطلب معتمَداً من هنا
// كان سيتجاوز ذلك كله: دَين على صيدلية بلا موافقتها وبلا فحص حدّها. فلا آثار
// مالية لهذا المسار على الإطلاق قبل أن تضغط الصيدلية «اعتماد العرض».
//
// Phase 3 (الأدوار والصلاحيات): يتطلب canQuoteOrders — المذخر يسعّر هنا فعلاً،
// فهي نفس صلاحية مسار quote.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { sendAndPersistNotification } from '@/app/lib/notifications/notificationTriggers';

const MAX_ITEMS = 100;

interface IncomingLine {
    catalogItemId?: unknown;
    quantity?: unknown;
    unitPrice?: unknown;
    bonusQuantity?: unknown;
}


export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canQuoteOrders');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const branchId = typeof body.branchId === 'string' ? body.branchId.trim() : '';
        if (!branchId) {
            return NextResponse.json({ error: 'فرع الصيدلية مطلوب' }, { status: 400 });
        }

        const rawLines: IncomingLine[] = Array.isArray(body.items) ? body.items : [];
        if (rawLines.length === 0) {
            return NextResponse.json({ error: 'يجب أن يحتوي الطلب على صنف واحد على الأقل' }, { status: 400 });
        }
        if (rawLines.length > MAX_ITEMS) {
            return NextResponse.json({ error: `الحد الأقصى ${MAX_ITEMS} صنفاً لكل طلب` }, { status: 400 });
        }

        const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

        // الفرع وهويّة مؤسسته — أساس كل الفحوص التالية.
        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { id: true, organizationId: true, organization: { select: { name: true } } },
        });
        if (!branch) {
            return NextResponse.json({ error: 'الفرع غير موجود' }, { status: 404 });
        }

        // علاقة تجارية قائمة مع هذه المؤسسة شرطٌ صريح: لا يُنشئ المذخر طلباً
        // على صيدلية لم يتّفق معها. والموقوفة تُرفض بنفس رسالة مسار الاعتماد.
        const customer = await prisma.warehouseCustomer.findFirst({
            where: { warehouseId: ctx.warehouseId, organizationId: branch.organizationId },
            select: { isBlocked: true },
        });
        if (!customer) {
            return NextResponse.json(
                { error: 'هذه الصيدلية ليست من عملائك — أضِفها من صفحة العملاء أولاً.' },
                { status: 403 }
            );
        }
        if (customer.isBlocked) {
            return NextResponse.json(
                { error: 'تعامل هذه الصيدلية موقوف — استأنفه من صفحة العملاء قبل إنشاء الطلب.' },
                { status: 409 }
            );
        }

        // الأصناف تُقرأ من كتالوج هذا المذخر حصراً، فلا يمكن حقن صنف مذخر آخر.
        const ids = Array.from(
            new Set(rawLines.map((l) => (typeof l.catalogItemId === 'string' ? l.catalogItemId : '')).filter(Boolean))
        );
        if (ids.length === 0) {
            return NextResponse.json({ error: 'كل بند يحتاج catalogItemId صالحاً' }, { status: 400 });
        }
        const catalogItems = await prisma.warehouseCatalogItem.findMany({
            where: { id: { in: ids }, warehouseId: ctx.warehouseId },
            select: {
                id: true, drugId: true, price: true, isAvailable: true,
                drug: { select: { tradeName: true } },
            },
        });
        const catalogById = new Map(catalogItems.map((c) => [c.id, c]));

        // التحقق من كل بند قبل أي كتابة — لا طلب جزئي.
        const lines: Array<{ drugId: string; quantity: number; unitPrice: number; bonusQuantity: number }> = [];
        for (const raw of rawLines) {
            const item = typeof raw.catalogItemId === 'string' ? catalogById.get(raw.catalogItemId) : undefined;
            if (!item) {
                return NextResponse.json(
                    { error: 'أحد الأصناف غير موجود في كتالوجك' },
                    { status: 400 }
                );
            }
            const quantity = Number(raw.quantity);
            if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) {
                return NextResponse.json(
                    { error: `كمية «${item.drug.tradeName}» يجب أن تكون عدداً صحيحاً موجباً` },
                    { status: 400 }
                );
            }
            // السعر: ما يكتبه المذخر، وإلا سعر الكتالوج. لا صفر ضمنيّ — صفر
            // يعني «مجاناً» وهو ما يخدمه bonusQuantity لا unitPrice.
            // صنف موقوف العرض لا يُطلب: الصيدلية لا تراه في الكتالوج، فإدخاله
            // نيابةً عنها يخلق عرضاً لا تستطيع مراجعته على المنصة.
            if (!item.isAvailable) {
                return NextResponse.json(
                    { error: `«${item.drug.tradeName}» موقوف العرض في كتالوجك — فعّله أولاً.` },
                    { status: 409 }
                );
            }
            const rawPrice = raw.unitPrice === undefined || raw.unitPrice === null || raw.unitPrice === ''
                ? item.price
                : Number(raw.unitPrice);
            if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
                return NextResponse.json(
                    { error: `سعر «${item.drug.tradeName}» يجب أن يكون رقماً موجباً` },
                    { status: 400 }
                );
            }
            const bonusQuantity = raw.bonusQuantity === undefined || raw.bonusQuantity === null
                ? 0
                : Number(raw.bonusQuantity);
            if (!Number.isInteger(bonusQuantity) || bonusQuantity < 0 || bonusQuantity > 1_000_000) {
                return NextResponse.json(
                    { error: `بونص «${item.drug.tradeName}» يجب أن يكون عدداً صحيحاً غير سالب` },
                    { status: 400 }
                );
            }
            lines.push({ drugId: item.drugId, quantity, unitPrice: rawPrice, bonusQuantity });
        }

        // صنف واحد مرتين في نفس الطلب يفسد الخصم والفوترة — يُرفض صريحاً.
        const drugIds = new Set(lines.map((l) => l.drugId));
        if (drugIds.size !== lines.length) {
            return NextResponse.json(
                { error: 'الصنف نفسه مكرَّر في الطلب — اجمع كميته في بند واحد.' },
                { status: 400 }
            );
        }

        const totalAmount = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

        const created = await prisma.$transaction(async (tx) => {
            const order = await tx.warehouseOrder.create({
                data: {
                    warehouseId: ctx.warehouseId,
                    branchId: branch.id,

                    // QUOTED: مسعَّر وجاهز لاعتماد الصيدلية — انظر تعليق الرأس.
                    status: 'QUOTED',
                    totalAmount,
                    notes,
                    items: {
                        create: lines.map((l) => ({
                            drugId: l.drugId,
                            quantity: l.quantity,
                            unitPrice: l.unitPrice,
                            // مسعَّر ابتداءً: quotedPrice/quotedQuantity مضبوطان
                            // فتحسبه effectiveLine كسطر متوفر كامل بلا خطوة تسعير.
                            quotedPrice: l.unitPrice,
                            quotedQuantity: l.quantity,
                            requestedPrice: l.unitPrice,
                            status: 'AVAILABLE',
                            bonusQuantity: l.bonusQuantity,
                        })),
                    },
                },
                select: { id: true, orderNumber: true, status: true, totalAmount: true, branchId: true },
            });

            // أصل الطلب يُسجَّل صراحةً في سجل الأحداث: لولا ذلك لظهر للصيدلية
            // عرضُ سعرٍ لطلب لم ترسله، بلا أي أثر يوضّح من أدخله ولا لماذا.
            await tx.warehouseOrderEvent.create({
                data: {
                    orderId: order.id,
                    type: 'QUOTED',
                    actorType: 'WAREHOUSE',
                    actorName: ctx.user.name ?? ctx.user.email ?? null,
                    payload: {
                        origin: 'PHONE_ORDER',
                        note: 'طلب هاتفي أدخله المذخر نيابةً عن الصيدلية — بانتظار اعتمادها.',
                    },
                },
            });

            return order;
        });

        // إشعار الصيدلية: بلا هذا يبقى عرض سعر معلّقاً لا يعلم به أحد.
        await sendAndPersistNotification({
            type: 'SYSTEM',
            branchId: created.branchId,
            title: 'عرض سعر من المذخر بانتظار اعتمادك',
            body: `أدخل المذخر طلباً هاتفياً نيابةً عنك (${created.orderNumber ?? ''}) — راجعه واعتمده.`,
            data: {
                kind: 'WAREHOUSE_ORDER',
                orderId: created.id,
                orderNumber: created.orderNumber,
            },
        });

        return NextResponse.json({ order: created }, { status: 201 });
    } catch (e: any) {
        console.error('warehouse-portal phone order POST error:', e);
        return NextResponse.json({ error: 'فشل في إنشاء الطلب الهاتفي' }, { status: 500 });
    }
}
