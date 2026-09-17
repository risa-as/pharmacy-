// المرحلة ب من ميزة تتبّع مخزون المذخر: صفحة «المخزون» — قراءة الخادم الأولية
// (نفس استعلام GET /api/warehouse-portal/stock ونفس دوال warehouse-stock.ts)
// ثم عميل تفاعلي للفلاتر وتوسيع الدفعات وعمليات الاستلام/التعديل/الإتلاف.
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { summarizeStock, isLowStock, deriveAvailability, expiryBucket, decideStockTracking } from "@/app/lib/warehouse-stock";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import StockClient from "./StockClient";

export const dynamic = "force-dynamic";

export default async function WarehouseStockPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    // Phase 3 (الأدوار والصلاحيات): هذه الصفحة تقرأ عبر Prisma مباشرة (لا عبر
    // GET /api/warehouse-portal/stock)، فبوابة الـ API وحدها لا تكفي لمنع من
    // لا يملك canViewStock (مثل ACCOUNTANT) من الوصول لهذه البيانات بفتح
    // الرابط مباشرة — إخفاء التبويب في layout.tsx واجهة فقط.
    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const canView =
        !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId && hasWarehousePermission(actor, 'canViewStock');
    if (!canView) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="المخزون" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    عرض المخزون يتطلب صلاحية "عرض المخزون" — راجع مالك المذخر.
                </div>
            </div>
        );
    }

    const items = await prisma.warehouseCatalogItem.findMany({
        where: { warehouseId: ctx.warehouseId },
        include: {
            drug: { select: { tradeName: true, scientificName: true } },
            batches: {
                orderBy: { expiryDate: "asc" },
                select: {
                    id: true,
                    batchNumber: true,
                    expiryDate: true,
                    quantity: true,
                    initialQuantity: true,
                    costPrice: true,
                    supplierName: true,
                },
            },
        },
        orderBy: { drug: { tradeName: "asc" } },
        take: 500,
    });

    const now = new Date();

    const initialItems = items.map((it) => {
        const summary = summarizeStock(it.batches, now);
        return {
            id: it.id,
            barcode: it.barcode,
            tradeName: it.drug.tradeName,
            scientificName: it.drug.scientificName,
            price: it.price,
            costPrice: it.costPrice,
            minStock: it.minStock,
            isAvailable: it.isAvailable,
            availability: deriveAvailability({ isListed: it.isAvailable, sellableQuantity: summary.totalQuantity }),
            // نفس قرار الشحن الفعلي (warehouse-stock.ts) — صنف بلا أي دفعة غير
            // متتبَّع، فلا يُعرَض كـ"نافد" (انظر فلتر "نافد" في StockClient).
            isTracked: decideStockTracking(summary.batchCount) === "ENFORCE",
            sellableQuantity: summary.totalQuantity,
            expiredQuantity: summary.expiredQuantity,
            batchCount: summary.batchCount,
            nearestExpiry: summary.nearestExpiry ? summary.nearestExpiry.toISOString() : null,
            nearestExpiryBucket: summary.nearestExpiry ? expiryBucket(summary.nearestExpiry, now) : null,
            isLowStock: isLowStock({ sellableQuantity: summary.totalQuantity, minStock: it.minStock }),
            batches: it.batches.map((b) => ({
                id: b.id,
                batchNumber: b.batchNumber,
                expiryDate: b.expiryDate.toISOString(),
                quantity: b.quantity,
                initialQuantity: b.initialQuantity,
                costPrice: b.costPrice,
                supplierName: b.supplierName,
                bucket: expiryBucket(b.expiryDate, now),
            })),
        };
    });

    return <StockClient initialItems={initialItems} />;
}
