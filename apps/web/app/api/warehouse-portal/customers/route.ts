// Phase 2 (الحسابات والعملاء) من نظام المذاخر B2B: قائمة الصيدليات المتعاملة
// مع هذا المذخر. المصدر الأساسي للقائمة هو WarehouseOrder (عبر Branch →
// Organization) وليس فقط صفوف WarehouseCustomer — تلك تُنشأ تلقائياً فقط عند
// أول اعتماد (app/api/warehouses/orders/[id]/route.ts)، فصيدلية أرسلت أول طلب
// لها ولم يُعتمد بعد يجب أن تظهر أيضاً، بشروط افتراضية (بلا حد ائتماني، نقدي،
// غير محظورة، customerId: null حتى يُعتمد أول طلب لها فيُنشأ الصف).
//
// المرحلة 5 (الصقل التجاري) §Part 1: صيدلية قد يُتَّفَق معها على شروط
// (POST أدناه) **قبل أي طلب إطلاقاً** — عندها لا يوجد لها صف في byOrg (المبني
// من WarehouseOrder) رغم أن لها صف WarehouseCustomer فعلي. القائمة يجب أن
// تتحد (union) من المصدرين: منظمات ظهرت في الطلبات ∪ منظمات لها WarehouseCustomer
// بلا أي طلب بعد — وإلا يختفي العميل الذي أُنشئ خصيصاً لهذا الغرض من الجدول.
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { outstandingWithOpeningBalance } from '@/app/lib/warehouse-accounts';

export async function GET() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewCustomers');
        if (!gate.ok) return gate.response;

        const [orders, customers, outstandingGroups, fieldSaleGroups] = await Promise.all([
            // DRAFT لم تُرسل بعد — لا تُحسب "تعاملاً" (نفس استثناء GET /orders).
            prisma.warehouseOrder.findMany({
                where: { warehouseId: ctx.warehouseId, status: { not: 'DRAFT' } },
                select: {
                    createdAt: true,
                    branch: { select: { organizationId: true, organization: { select: { name: true } } } },
                },
            }),
            prisma.warehouseCustomer.findMany({
                where: { warehouseId: ctx.warehouseId },
                include: { organization: { select: { name: true } } },
            }),
            prisma.warehouseInvoice.groupBy({
                by: ['organizationId'],
                where: { warehouseId: ctx.warehouseId, status: { in: ['UNPAID', 'PARTIAL'] } },
                _sum: { total: true, paidAmount: true },
            }),
            // الدفتر الثاني: فواتير البيع الميداني (فحص 2026-09-17، فجوة G1).
            // `organizationId: { not: null }` لأن البيع لصيدلية خارج المنصة اسمٌ
            // نصيّ لا مؤسسة — لا يُحمَّل على رصيد أي عميل هنا (يظهر في إجمالي
            // المذخر عبر loadOpenReceivables).
            prisma.warehouseFieldSale.groupBy({
                by: ['organizationId'],
                where: {
                    warehouseId: ctx.warehouseId,
                    status: { in: ['UNPAID', 'PARTIAL'] },
                    organizationId: { not: null },
                },
                _sum: { total: true, paidAmount: true },
            }),
        ]);

        type OrgAgg = { organizationId: string; name: string; orderCount: number; lastOrderDate: Date | null };
        const byOrg = new Map<string, OrgAgg>();
        for (const o of orders) {
            const orgId = o.branch.organizationId;
            const existing = byOrg.get(orgId);
            if (existing) {
                existing.orderCount += 1;
                if (existing.lastOrderDate === null || o.createdAt > existing.lastOrderDate) existing.lastOrderDate = o.createdAt;
            } else {
                byOrg.set(orgId, {
                    organizationId: orgId,
                    name: o.branch.organization?.name ?? orgId,
                    orderCount: 1,
                    lastOrderDate: o.createdAt,
                });
            }
        }

        // عملاء لهم شروط مُتَّفَق عليها (Part 1) لكن بلا أي طلب بعد — يظهرون
        // بـ orderCount: 0 وlastOrderDate: null بدل الغياب الكامل عن القائمة.
        for (const c of customers) {
            if (!byOrg.has(c.organizationId)) {
                byOrg.set(c.organizationId, {
                    organizationId: c.organizationId,
                    name: c.organization?.name ?? c.organizationId,
                    orderCount: 0,
                    lastOrderDate: null,
                });
            }
        }

        const customerByOrg = new Map(customers.map((c) => [c.organizationId, c]));

        // صفّان مُجمَّعان لكل منظمة (لا صف واحد مدموج): صف فواتير المنصة وصف
        // مبيعات المندوبين الميدانية، كلٌّ من مصدره — outstandingWithOpeningBalance
        // (عبر sumOutstanding) تُقصّ كل صفّ سالب إلى صفر قبل الجمع، فإبقاؤهما
        // منفصلين هنا يطابق تماماً ما كان يحدث سابقاً حين كانت كل مجموعة تُحسب
        // على حدة ثم تُجمَع (بخلاف دمجهما في صفّ واحد قبل القص).
        type AggRow = { total: number; paidAmount: number };
        const openRowsByOrg = new Map<string, AggRow[]>();
        const pushRow = (orgId: string | null, row: AggRow) => {
            if (!orgId) return;
            const list = openRowsByOrg.get(orgId);
            if (list) list.push(row);
            else openRowsByOrg.set(orgId, [row]);
        };
        for (const g of outstandingGroups) {
            pushRow(g.organizationId, { total: g._sum.total ?? 0, paidAmount: g._sum.paidAmount ?? 0 });
        }
        for (const g of fieldSaleGroups) {
            // organizationId: { not: null } مضبوط في استعلام fieldSaleGroups أصلاً
            // (بيع لصيدلية خارج المنصة اسمٌ نصّي لا مؤسسة) — pushRow تتجاهله ثانيةً
            // احترازاً فقط.
            pushRow(g.organizationId, { total: g._sum.total ?? 0, paidAmount: g._sum.paidAmount ?? 0 });
        }

        const rows = Array.from(byOrg.values())
            .map((org) => {
                const customer = customerByOrg.get(org.organizationId) ?? null;
                const openingBalance = customer?.openingBalance ?? 0;
                return {
                    customerId: customer?.id ?? null,
                    organizationId: org.organizationId,
                    name: org.name,
                    orderCount: org.orderCount,
                    lastOrderDate: org.lastOrderDate,
                    creditLimit: customer?.creditLimit ?? 0,
                    paymentTermDays: customer?.paymentTermDays ?? 0,
                    // رصيد سابق يُدار من صفحة العملاء — انظر تعليق الحقل في
                    // schema.prisma. يُعرَض هنا منفصلاً عن outstanding أدناه كي لا
                    // يظنّ أحد أن تعديله يصحّح "المستحق اليوم" بدل الدَين الموروث.
                    openingBalance,
                    priceTier: customer?.priceTier ?? null,
                    isBlocked: customer?.isBlocked ?? false,
                    notes: customer?.notes ?? null,
                    // المستحق الكلي = الرصيد السابق + كل المستندات المفتوحة —
                    // outstandingWithOpeningBalance الموحَّدة (warehouse-accounts.ts)،
                    // نفس الدالة التي يستخدمها فحص حدّ الائتمان عند الاعتماد.
                    outstanding: outstandingWithOpeningBalance(openingBalance, openRowsByOrg.get(org.organizationId) ?? []),
                };
            })
            .sort((a, b) => (b.lastOrderDate?.getTime() ?? 0) - (a.lastOrderDate?.getTime() ?? 0));

        return NextResponse.json({ customers: rows });
    } catch (e: any) {
        console.error('warehouse-portal customers GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب قائمة العملاء' }, { status: 500 });
    }
}

// POST: إنشاء علاقة تجارية (WarehouseCustomer) مع صيدلية لم تطلب بعد — يسدّ
// فجوة "لا يمكن الاتفاق على شروط قبل أول طلب" (المرحلة 5 §Part 1). بخلاف
// الإنشاء التلقائي عند أول اعتماد (warehouseId_organizationId افتراضي)، هذا
// المسار يقبل شروطاً فعلية منذ البداية.
// Body: { organizationId, creditLimit?, paymentTermDays?, priceTier?, notes? }
export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canEditCustomerTerms');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const organizationId: string | undefined = body.organizationId;
        if (!organizationId || typeof organizationId !== 'string') {
            return NextResponse.json({ error: 'organizationId مطلوب' }, { status: 400 });
        }

        // منظمة حقيقية؟ warehouseId يأتي من السياق حصراً — لا يُقبَل من الجسم إطلاقاً.
        const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
        if (!org) {
            return NextResponse.json({ error: 'الصيدلية (المنظمة) غير موجودة.' }, { status: 404 });
        }

        const data: {
            warehouseId: string;
            organizationId: string;
            creditLimit?: number;
            paymentTermDays?: number;
            openingBalance?: number;
            priceTier?: string | null;
            notes?: string | null;
        } = { warehouseId: ctx.warehouseId, organizationId };

        if ('creditLimit' in body) {
            const v = Number(body.creditLimit);
            if (!Number.isFinite(v) || v < 0) {
                return NextResponse.json({ error: 'حدّ الائتمان يجب أن يكون رقماً غير سالب.' }, { status: 400 });
            }
            data.creditLimit = v;
        }

        // رصيد سابق: نفس نمط تحقّق creditLimit بالضبط (رقم منتهٍ غير سالب) —
        // دَين موروث لا يكون سالباً منطقياً هنا (رصيد دائن للعميل ليس ما تمثّله
        // هذه الميزة)، ويُدخَل يدوياً مرة عند الإعداد فقط.
        if ('openingBalance' in body) {
            const v = Number(body.openingBalance);
            if (!Number.isFinite(v) || v < 0) {
                return NextResponse.json({ error: 'الرصيد السابق يجب أن يكون رقماً غير سالب.' }, { status: 400 });
            }
            data.openingBalance = v;
        }

        if ('paymentTermDays' in body) {
            const v = Number(body.paymentTermDays);
            if (!Number.isInteger(v) || v < 0) {
                return NextResponse.json({ error: 'مهلة السداد يجب أن تكون عدداً صحيحاً غير سالب.' }, { status: 400 });
            }
            data.paymentTermDays = v;
        }

        if ('priceTier' in body) {
            if (body.priceTier !== null && typeof body.priceTier !== 'string') {
                return NextResponse.json({ error: 'شريحة التسعير غير صالحة.' }, { status: 400 });
            }
            data.priceTier = body.priceTier === null ? null : body.priceTier.trim() || null;
        }

        if ('notes' in body) {
            if (body.notes !== null && typeof body.notes !== 'string') {
                return NextResponse.json({ error: 'الملاحظات غير صالحة.' }, { status: 400 });
            }
            data.notes = body.notes === null ? null : body.notes.trim() || null;
        }

        const customer = await prisma.warehouseCustomer.create({ data });

        return NextResponse.json({ customer }, { status: 201 });
    } catch (e: any) {
        // @@unique([warehouseId, organizationId]) — علاقة موجودة أصلاً (طلب سابق
        // أُنشئت له تلقائياً، أو محاولة إضافة مكرَّرة). لا نُسرّب P2002 خاماً.
        if (e?.code === 'P2002') {
            return NextResponse.json(
                { error: 'توجد بالفعل علاقة تجارية مع هذه الصيدلية لدى مذخرك — عدّل شروطها من قائمة العملاء بدل إنشاء صف جديد.' },
                { status: 409 }
            );
        }
        console.error('warehouse-portal customers POST error:', e);
        return NextResponse.json({ error: 'فشل في إنشاء العميل' }, { status: 500 });
    }
}
