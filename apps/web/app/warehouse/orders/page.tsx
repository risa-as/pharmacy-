// المرحلة 3 من ميزة المذاخر: صفحة صندوق الطلبات (خادم) + عميل القائمة والمراجعة.
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import { buildAlternativesByItemId } from "@/app/lib/warehouse-order-alternatives";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import OrdersClient from "./OrdersClient";
import { warehouseInboxQuery } from '@/app/lib/warehouse-order-query';

export const dynamic = "force-dynamic";

export default async function WarehouseOrdersPage(
    props: {
        searchParams?: Promise<{ status?: string }>;
    }
) {
    const searchParams = await props.searchParams;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    // Phase 3 (الأدوار والصلاحيات): هذه الصفحة تقرأ عبر Prisma مباشرة (لا عبر
    // مسار API مذخر)، فإخفاء التبويب في layout.tsx واجهة فقط — البوابة
    // الفعلية هنا لمنع من لا يملك canViewOrders من فتح الرابط مباشرة.
    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const belongsAndActive =
        !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId;
    const canView = belongsAndActive && hasWarehousePermission(actor!, 'canViewOrders');
    // يحكم ظهور رابط «قائمة التجهيز» فقط — الصفحة المطبوعة تحرس نفسها بنفس
    // المفتاح، فإخفاء الرابط واجهةٌ لا حماية.
    const canShipOrders = belongsAndActive && hasWarehousePermission(actor!, 'canShipOrders');
    // يحكم ظهور زرّ «طلب هاتفي» — ومسار POST /orders/phone يحرس نفسه بنفس المفتاح.
    const canQuoteOrders = belongsAndActive && hasWarehousePermission(actor!, 'canQuoteOrders');
    if (!canView) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="الطلبات" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    عرض الطلبات يتطلب صلاحية "عرض الطلبات" — راجع مالك المذخر.
                </div>
            </div>
        );
    }

    let query;
    try { query = warehouseInboxQuery(searchParams?.status); }
    catch { redirect('/warehouse/orders'); }

    const orders = await prisma.warehouseOrder.findMany({
        where: {
            warehouseId: ctx.warehouseId,
            // DRAFT لم يُرسل بعد — لا يظهر للمذخر إطلاقاً.
            status: query.status,
        },
        include: {
            // اسم الفرع وحده لا يميّز الصيدلية: كل المؤسسات الست في الإنتاج
            // تسمّي فرعها الافتراضي «الفرع الرئيسي»، فيصل اسم المؤسسة أيضاً —
            // نفس شكل select في app/api/warehouse-portal/orders/route.ts
            // و.../[id]/route.ts، إذ الثلاثة تغذّي نفس OrdersClient.tsx ويجب
            // أن تتطابق أشكالها كي لا يختفي الحقل بين التحميل الأول والتحديث.
            branch: { select: { name: true, organization: { select: { name: true } } } },
            items: {
                include: { drug: { select: { tradeName: true, barcode: true, alternatives: true } } },
            },
            events: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
    });

    // ميزة البونص: قاعدة البونص القياسية (bonusThreshold/bonusQuantity) لكل
    // صنف مذكور في هذه الطلبات — تُقترَح فقط كقيمة أولية في شاشة المراجعة
    // (computeBonusUnits في app/lib/warehouse-bonus.ts)، لا تُخزَّن أو تُفرَض.
    const barcodes = Array.from(new Set(orders.flatMap((o) => o.items.map((it) => it.drug.barcode))));
    const bonusRules =
        barcodes.length > 0
            ? await prisma.warehouseCatalogItem.findMany({
                  where: { warehouseId: ctx.warehouseId, barcode: { in: barcodes } },
                  select: { barcode: true, bonusThreshold: true, bonusQuantity: true },
              })
            : [];
    const bonusRuleByBarcode = new Map(bonusRules.map((r) => [r.barcode, r]));

    // المرحلة 4 (بدائل الدواء): استعلام واحد يغطي أصناف كل الطلبات المعروضة
    // معاً (لا استعلام لكل طلب) — انظر app/lib/warehouse-order-alternatives.ts
    // لماذا هذه الدالة مشتركة حرفياً مع app/api/warehouse-portal/orders/[id]/route.ts
    // (نفس البيانات يجب أن تصل هنا كما تصل هناك بعد refreshOne، وإلا رأى المذخر
    // بدائل تختفي وتظهر بين تحميل القائمة وتحديثها بعد إرسال العرض).
    const allItems = orders.flatMap((o) => o.items);
    const alternativesByItemId = await buildAlternativesByItemId(prisma, ctx.warehouseId, allItems);

    const ordersWithBonusRule = orders.map((o) => ({
        ...o,
        items: o.items.map((it) => ({
            ...it,
            catalogBonusThreshold: bonusRuleByBarcode.get(it.drug.barcode)?.bonusThreshold ?? 0,
            catalogBonusQuantity: bonusRuleByBarcode.get(it.drug.barcode)?.bonusQuantity ?? 0,
            alternatives: alternativesByItemId.get(it.id) ?? [],
        })),
    }));

    return (
        <OrdersClient
            initialOrders={JSON.parse(JSON.stringify(ordersWithBonusRule))}
            canShipOrders={canShipOrders}
            canQuoteOrders={canQuoteOrders}
        />
    );
}
