export const dynamic = 'force-dynamic';

// المرحلة ب من ميزة تتبّع مخزون المذخر: قراءة مخزون كتالوج المذخر — لا كتابة هنا
// (الاستلام/التعديل/الإتلاف في مساراتهم الخاصة تحت هذا المجلد). كل الحساب يمر
// عبر app/lib/warehouse-stock.ts (summarizeStock/isLowStock/deriveAvailability/
// expiryBucket) — لا يُعاد حساب أي قاعدة هنا.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { summarizeStock, isLowStock, deriveAvailability, expiryBucket, decideStockTracking } from '@/app/lib/warehouse-stock';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { catalogMarginPercent } from '@/app/lib/warehouse-pricing';
import { hasWarehousePermission } from '@/app/lib/warehouse-permissions';

type StockFilter = 'low' | 'expiring' | 'out';

// GET: كتالوج مذخري مع أرصدة محسوبة — ?filter=low|expiring|out و ?search=
export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewStock');
        if (!gate.ok) return gate.response;

        // كلفة الشراء وهامش الربح بيانات مالية حسّاسة: canViewStock وحدها لا
        // تكفي لكشفهما. SALES و INVENTORY يملكان canViewStock ولا يملكان
        // canViewFinance، فيجب أن يصلهما ردّ بلا كلفة ولا هامش — حذفاً من
        // الحمولة نفسها لا إخفاءً في الواجهة (الواجهة ليست حارساً).
        const canViewFinance = hasWarehousePermission(gate.actor, 'canViewFinance');

        const { searchParams } = new URL(req.url);
        const search = (searchParams.get('search') || '').trim();
        const filter = (searchParams.get('filter') || undefined) as StockFilter | undefined;

        // مصدر الحقيقة الوحيد لملكية الصنف: warehouseId من السياق حصراً — لا
        // مذخر يقرأ مخزون مذخر آخر مهما كانت معاملات الطلب.
        const items = await prisma.warehouseCatalogItem.findMany({
            where: {
                warehouseId: ctx.warehouseId,
                ...(search
                    ? {
                          OR: [
                              { drug: { tradeName: { contains: search, mode: 'insensitive' } } },
                              { barcode: { contains: search } },
                          ],
                      }
                    : {}),
            },
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
            orderBy: { drug: { tradeName: 'asc' } },
            take: 500,
        });

        const now = new Date();

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

        const filtered = rows.filter((r) => {
            if (filter === 'low') return r.isLowStock;
            if (filter === 'expiring') return r.nearestExpiryBucket === 'CRITICAL' || r.nearestExpiryBucket === 'WARNING';
            // "نافد" يقتصر على أصناف متتبَّعة فعلاً وصفرية الرصيد — صنف غير
            // متتبَّع (بلا أي دفعة) ليس "نافداً"، هو ببساطة لم يُدخَل مخزونه بعد.
            if (filter === 'out') return r.isTracked && r.sellableQuantity === 0;
            return true;
        });

        return NextResponse.json({ items: filtered });
    } catch (e: any) {
        console.error('warehouse-portal stock GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب المخزون' }, { status: 500 });
    }
}
