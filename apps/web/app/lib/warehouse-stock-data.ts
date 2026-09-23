import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import { summarizeStock, isLowStock, deriveAvailability, expiryBucket, decideStockTracking } from './warehouse-stock';
import { catalogMarginPercent } from './warehouse-pricing';
export async function loadWarehouseStock(warehouseId: string, canViewFinance: boolean, search = '', filter = '', page = 1) {
        const now = new Date();
        const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
        const condition = filter === 'low' ? Prisma.sql`"minStock" > 0 AND quantity <= "minStock"`
            : filter === 'out' ? Prisma.sql`batches > 0 AND quantity = 0`
            : filter === 'expiring' ? Prisma.sql`expiry <= ${new Date(now.getTime() + 180 * 86400000)}` : Prisma.sql`TRUE`;
        const projection = Prisma.sql`WITH stock AS (
            SELECT c.id, c."minStock", d."tradeName", COUNT(b.id) AS batches,
                COALESCE(SUM(CASE WHEN b."expiryDate" > ${now} THEN GREATEST(b.quantity,0) ELSE 0 END),0) AS quantity,
                MIN(CASE WHEN b.quantity > 0 AND b."expiryDate" > ${now} THEN b."expiryDate" END) AS expiry
            FROM "WarehouseCatalogItem" c JOIN "GlobalDrug" d ON d.id = c."drugId"
            LEFT JOIN "WarehouseBatch" b ON b."catalogItemId" = c.id
            WHERE c."warehouseId" = ${warehouseId}
                ${search ? Prisma.sql`AND (d."tradeName" ILIKE ${pattern} OR c.barcode ILIKE ${pattern})` : Prisma.empty}
            GROUP BY c.id, d."tradeName"
        )`;
        const { items, total } = await prisma.$transaction(async tx => {
            const counts = await tx.$queryRaw<{ total: bigint }[]>`${projection} SELECT COUNT(*) AS total FROM stock WHERE ${condition}`;
            const ids = await tx.$queryRaw<{ id: string }[]>`${projection} SELECT id FROM stock WHERE ${condition} ORDER BY "tradeName", id LIMIT 50 OFFSET ${(page - 1) * 50}`;
            const items = await tx.warehouseCatalogItem.findMany({
            where: { warehouseId, id: { in: ids.map(row => row.id) } },
            include: {
                drug: { select: { tradeName: true, scientificName: true, origin: true } },
                batches: {
                    orderBy: { expiryDate: 'asc' },
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
            });
            const order = new Map(ids.map((row, index) => [row.id, index]));
            items.sort((a,b) => order.get(a.id)! - order.get(b.id)!);
            return { items, total: Number(counts[0].total) };
        }, { isolationLevel: 'RepeatableRead' });

        const rows = items.map((it) => {
            const summary = summarizeStock(it.batches, now);
            const lowStock = isLowStock({ sellableQuantity: summary.totalQuantity, minStock: it.minStock });
            const availability = deriveAvailability({ isListed: it.isAvailable, sellableQuantity: summary.totalQuantity });
            // نفس قرار "متتبَّع أم لا" المستخدَم فعلياً عند الشحن (شحن الطلبات،
            // warehouse-stock.ts) — صنف بلا أي دفعة هو صنف غير متتبَّع، وليس
            // بالضرورة "نافد": لا فرق ظاهري بين الاثنين هنا وإلا التبس فلتر
            // "نافد" مع أصناف لم يُدخِل لها المذخر مخزوناً بعد إطلاقاً.
            const isTracked = decideStockTracking(summary.batchCount) === 'ENFORCE';

            return {
                id: it.id,
                barcode: it.barcode,
                tradeName: it.drug.tradeName,
                scientificName: it.drug.scientificName,
                origin: it.drug.origin,
                price: it.price,
                costPrice: canViewFinance ? it.costPrice : null,
                minStock: it.minStock,
                // مجهولة (null) إن كانت costPrice غائبة/صفرية/سالبة — انظر
                // catalogMarginPercent في warehouse-pricing.ts. لا تُحسَب هنا
                // من جديد بحساب JSX مستقل في أي عميل يستهلك هذا المسار.
                marginPercent: canViewFinance
                    ? catalogMarginPercent({ price: it.price, costPrice: it.costPrice })
                    : null,
                // ميزة البونص: قاعدة قياسية للصنف — تعرض دائماً (ليست بياناً مالياً
                // حسّاساً بنفس درجة الكلفة، بل شرط تجاري ظاهر أصلاً في التسعير
                // المتفاوَض عليه)، بخلاف costPrice/marginPercent المحصورين بـ canViewFinance.
                bonusThreshold: it.bonusThreshold,
                bonusQuantity: it.bonusQuantity,
                isAvailable: it.isAvailable,
                availability,
                isTracked,
                // sellableQuantity يستثني المنتهي — batchCount يعدّ كل الدفعات
                // بصرف النظر عن الصلاحية. لا تُعرَضان أبداً كقياس واحد (انظر
                // ملاحظة الواجهة في تقرير المرحلة ب).
                sellableQuantity: summary.totalQuantity,
                expiredQuantity: summary.expiredQuantity,
                batchCount: summary.batchCount,
                nearestExpiry: summary.nearestExpiry,
                nearestExpiryBucket: summary.nearestExpiry ? expiryBucket(summary.nearestExpiry, now) : null,
                isLowStock: lowStock,
                batches: it.batches.map((b) => ({
                    id: b.id,
                    batchNumber: b.batchNumber,
                    expiryDate: b.expiryDate,
                    quantity: b.quantity,
                    initialQuantity: b.initialQuantity,
                    costPrice: canViewFinance ? b.costPrice : null,
                    supplierName: b.supplierName,
                    bucket: expiryBucket(b.expiryDate, now),
                })),
            };
        });

return { items: rows, total, page, pageSize: 50 };
}
