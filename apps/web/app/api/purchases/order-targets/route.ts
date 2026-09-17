export const dynamic = 'force-dynamic';

// جهات الطلب لصفحة «طلب أدوية من المذاخر»: مذاخر المنصة النشطة مع علاقة المؤسسة
// بكلٍّ منها، وموردو المؤسسة المحليون (للطلب اليدوي)، وتحذير المورد المكرر.
//
// مسار مستقل عمداً بدل تعديل /api/warehouses/directory: ذاك له ثلاثة مستهلكين
// آخرين يعتمدون على شكله وترتيبه، و/api/suppliers يُخزَّن مؤقتاً (s-maxage=300)
// فيُظهر حالة ربط قديمة بعد ربط مورد للتو.
//
// النطاق من الخادم حصراً (§146) والبوابة canCreatePurchase — نفس بوابة الإرسال.
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { checkFeatureAccess } from '@/app/lib/saas-guards';
import { findLikelySupplierMatches } from '@/app/lib/supplier-duplicate-match';

export async function GET() {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        if (!tenantCtx.userPermissions.canCreatePurchase) {
            return NextResponse.json({ error: 'ليس لديك صلاحية إنشاء المشتريات.', code: 'FORBIDDEN' }, { status: 403 });
        }

        const organizationId = tenantCtx.organizationId ?? null;
        if (organizationId) {
            const access = await checkFeatureAccess(organizationId, 'warehouseManagement');
            if (!access.allowed) {
                return NextResponse.json(
                    { error: 'هذه الميزة متاحة في باقة الشركات فقط.', code: 'FEATURE_NOT_IN_PLAN', requiredPlan: 'ENTERPRISE' },
                    { status: 403 }
                );
            }
        }

        const warehouses = await prisma.warehouse.findMany({
            where: { isActive: true },
            select: { id: true, name: true, city: true, phone: true },
            orderBy: { name: 'asc' },
        });

        // بلا مؤسسة (SUPER_ADMIN): الدليل فقط، بلا علاقات ولا موردين.
        if (!organizationId) {
            return NextResponse.json({
                warehouses: warehouses.map((w) => ({
                    id: w.id, name: w.name, city: w.city, linkedSupplier: null, isRelated: false, possibleDuplicates: [],
                })),
                suppliers: [],
            });
        }

        const [suppliers, customers, orderedFrom] = await Promise.all([
            prisma.supplier.findMany({
                where: { organizationId },
                select: { id: true, name: true, phone: true, warehouseId: true, warehouse: { select: { name: true } } },
                orderBy: { name: 'asc' },
            }),
            prisma.warehouseCustomer.findMany({
                where: { organizationId },
                select: { warehouseId: true },
            }),
            prisma.warehouseOrder.findMany({
                where: { branch: { organizationId } },
                select: { warehouseId: true },
                distinct: ['warehouseId'],
            }),
        ]);

        const related = new Set([...customers.map((c) => c.warehouseId), ...orderedFrom.map((o) => o.warehouseId)]);
        const linkedByWarehouse = new Map(
            suppliers.filter((s) => s.warehouseId).map((s) => [s.warehouseId as string, { id: s.id, name: s.name }])
        );

        return NextResponse.json({
            warehouses: warehouses.map((w) => {
                const linkedSupplier = linkedByWarehouse.get(w.id) ?? null;
                return {
                    id: w.id,
                    name: w.name,
                    city: w.city,
                    linkedSupplier,
                    isRelated: related.has(w.id),
                    // مذخر له مورد مربوط لن يُنشئ مورداً جديداً — لا حاجة للتحذير.
                    possibleDuplicates: linkedSupplier ? [] : findLikelySupplierMatches(w, suppliers),
                };
            }),
            suppliers: suppliers.map((s) => ({
                id: s.id,
                name: s.name,
                phone: s.phone,
                warehouseId: s.warehouseId,
                warehouseName: s.warehouse?.name ?? null,
            })),
        });
    } catch (e) {
        console.error('order-targets GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب جهات الطلب' }, { status: 500 });
    }
}
