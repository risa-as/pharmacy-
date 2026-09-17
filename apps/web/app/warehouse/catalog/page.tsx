// المرحلة 3 من ميزة المذاخر: صفحة «أدويتي» — كتالوج المذخر (قراءة الخادم + عميل).
// المرحلة ب من ميزة تتبّع المخزون: زُوِّدت القراءة الأولية برصيد قابل للبيع
// وتوفر فعلي (deriveAvailability) — نفس حساب /api/warehouse-portal/stock حرفياً.
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { summarizeStock, deriveAvailability, isLowStock } from "@/app/lib/warehouse-stock";
import { catalogMarginPercent } from "@/app/lib/warehouse-pricing";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import CatalogClient from "./CatalogClient";

export const dynamic = "force-dynamic";

export default async function WarehouseCatalogPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    // Phase 3 (الأدوار والصلاحيات): هذه الصفحة تقرأ عبر Prisma مباشرة (لا عبر
    // GET /api/warehouse-portal/catalog)، فبوابة الـ API وحدها لا تكفي لمنع من
    // لا يملك canViewCatalog من الوصول لهذه البيانات بفتح الرابط مباشرة —
    // إخفاء التبويب في layout.tsx واجهة فقط.
    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const canView =
        !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId && hasWarehousePermission(actor, 'canViewCatalog');
    if (!canView) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="الكتالوج" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    عرض الكتالوج يتطلب صلاحية "عرض الكتالوج" — راجع مالك المذخر.
                </div>
            </div>
        );
    }

    const items = await prisma.warehouseCatalogItem.findMany({
        where: { warehouseId: ctx.warehouseId },
        include: {
            drug: { select: { tradeName: true, scientificName: true, origin: true } },
            batches: { select: { id: true, quantity: true, expiryDate: true } },
        },
        orderBy: { drug: { tradeName: "asc" } },
        take: 500,
    });

    // المرحلة 5 (الصقل التجاري): أسعار الشرائح والتعديل الجماعي محصوران بمن
    // يملك canEditPricing فعلياً — تمرَّر كـ prop صريح للعميل (نفس نمط isOwner
    // في app/warehouse/customers/CustomersClient.tsx)، والخادم (مسارات
    // tier-prices وbulk-price) هو خط الدفاع الحقيقي بصرف النظر عمّا تُظهره هذه الصفحة.
    const canEditPricing = hasWarehousePermission(actor, 'canEditPricing');
    // سدّ الفجوة الهيكلية (costPrice/minStock بلا حقل إدخال): كلفة الشراء
    // والهامش معلومتان مالية — تُحسَب هنا في الخادم فقط وتُمرَّر كـ prop منطقي
    // صريح، بنفس نمط canEditPricing أعلاه — لا فحص صلاحية من جانب العميل إطلاقاً.
    const canViewFinance = hasWarehousePermission(actor, 'canViewFinance');

    return (
        <CatalogClient
            canEditPricing={canEditPricing}
            canViewFinance={canViewFinance}
            initialItems={items.map((i) => {
                const sellableQuantity = summarizeStock(i.batches).totalQuantity;
                return {
                    id: i.id,
                    barcode: i.barcode,
                    tradeName: i.drug.tradeName,
                    scientificName: i.drug.scientificName,
                    origin: i.drug.origin,
                    price: i.price,
                    costPrice: i.costPrice,
                    minStock: i.minStock,
                    bonusThreshold: i.bonusThreshold,
                    bonusQuantity: i.bonusQuantity,
                    marginPercent: catalogMarginPercent({ price: i.price, costPrice: i.costPrice }),
                    isAvailable: i.isAvailable,
                    sellableQuantity,
                    availability: deriveAvailability({ isListed: i.isAvailable, sellableQuantity }),
                    isLowStock: isLowStock({ sellableQuantity, minStock: i.minStock }),
                };
            })}
        />
    );
}
