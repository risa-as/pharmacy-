export const dynamic = 'force-dynamic';

// المرحلة 4 من ميزة المذاخر: دليل المذاخر للصيدليات (قراءة فقط) + كتالوج مذخر محدد.
// يعرض فقط المذاخر النشطة مع عدد أصنافها المتوفرة؛ كتالوج مذخر محدد يعرض السعر والتوفر.
// العزل: WAREHOUSE role مرفوض هنا (getTenantContext يرفضه أصلاً منذ المرحلة 1).
//
// المرحلة 5 (الصقل التجاري) §Part 2: كتالوج مذخر محدد يعرض الآن سعر **الشريحة
// الخاصة بهذه الصيدلية** بدل سعر القائمة الخام دائماً — عبر resolveTierPrice()
// النقية في app/lib/warehouse-pricing.ts. الحقل `price` يبقى الحقل الفعّال
// (نفس الاسم الذي يقرأه WarehouseOrderClient.tsx ويرسله كـ unitPrice عند
// الطلب، فتُطبَّق الشريحة بلا أي تعديل على مسار الطلب نفسه)، وlistPrice/
// priceSource يُضافان للشفافية فقط.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { checkFeatureAccess } from '@/app/lib/saas-guards';
import { resolveTierPrice } from '@/app/lib/warehouse-pricing';

export async function GET(req: NextRequest) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canViewWarehouseOrders) return NextResponse.json({ error: 'ليس لديك صلاحية لهذا الإجراء.' }, { status: 403 });

        if (tenantCtx.organizationId) {
            const access = await checkFeatureAccess(tenantCtx.organizationId, 'warehouseManagement');
            if (!access.allowed) {
                return NextResponse.json(
                    { error: 'هذه الميزة متاحة في باقة الشركات فقط.', code: 'FEATURE_NOT_IN_PLAN', requiredPlan: 'ENTERPRISE' },
                    { status: 403 }
                );
            }
        }

        const { searchParams } = new URL(req.url);
        const warehouseId = searchParams.get('warehouseId');
        const search = (searchParams.get('search') || '').trim();

        // بلا warehouseId: دليل المذاخر النشطة + عدد الأصناف المتوفرة لكل مذخر.
        if (!warehouseId) {
            const warehouses = await prisma.warehouse.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    city: true,
                    phone: true,
                    _count: { select: { catalogItems: { where: { isAvailable: true } } } },
                },
                orderBy: { name: 'asc' },
            });
            return NextResponse.json({ warehouses });
        }

        // كتالوج مذخر محدد — البحث بالاسم أو الباركود.
        const warehouse = await prisma.warehouse.findFirst({
            where: { id: warehouseId, isActive: true },
            select: { id: true, name: true, city: true },
        });
        if (!warehouse) {
            return NextResponse.json({ error: 'المذخر غير موجود أو غير مفعّل' }, { status: 404 });
        }

        // شريحة تسعير الصيدلية الطالبة لدى هذا المذخر تحديداً (إن وُجدت علاقة
        // تجارية أصلاً) — SUPER_ADMIN أو مستخدم بلا organizationId يسقط بأمان
        // على null فيرى سعر القائمة دائماً (resolveTierPrice: tier فارغ → LIST).
        const customer = tenantCtx.organizationId
            ? await prisma.warehouseCustomer.findUnique({
                  where: { warehouseId_organizationId: { warehouseId, organizationId: tenantCtx.organizationId } },
                  select: { priceTier: true },
              })
            : null;

        const items = await prisma.warehouseCatalogItem.findMany({
            where: {
                warehouseId,
                isAvailable: true,
                // ميزة نطاق المذخر: الأصناف التي أضافها المذخر ولم تُرقَّ بعد إلى
                // الكتالوج العالمي تبقى داخلية عنده. سبب الحجب أن بند الطلب يحمل
                // drugId عالمياً يفهمه الطرفان (orders/route.ts ← PurchaseItem.drugId
                // ← دفعات الصيدلية)، ومعرّف صف مذخريّ لا معنى له عند الصيدلية.
                // فإظهارها هنا كان سيعني «ظاهر وغير قابل للطلب» — يمنعه هذا الشرط.
                drug: { warehouseId: null },
                ...(search
                    ? {
                          OR: [
                              { drug: { tradeName: { contains: search, mode: 'insensitive' } } },
                              { barcode: { contains: search } },
                          ],
                      }
                    : {}),
            },
            select: {
                id: true,
                barcode: true,
                price: true,
                drug: { select: { tradeName: true, scientificName: true } },
                tierPrices: { select: { tier: true, price: true } },
            },
            orderBy: { drug: { tradeName: 'asc' } },
            take: 300,
        });

        const priced = items.map((it) => {
            const resolved = resolveTierPrice({
                listPrice: it.price,
                tier: customer?.priceTier ?? null,
                tierPrices: it.tierPrices,
            });
            return {
                id: it.id,
                barcode: it.barcode,
                drug: it.drug,
                // الحقل الفعّال — نفس ما كان يُرسَل دوماً، الآن مُطبَّقاً عليه سعر
                // الشريحة إن وُجد.
                price: resolved.price,
                listPrice: it.price,
                priceSource: resolved.source,
            };
        });

        return NextResponse.json({ warehouse, items: priced });
    } catch (e: any) {
        console.error('warehouse directory GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب دليل المذاخر' }, { status: 500 });
    }
}
