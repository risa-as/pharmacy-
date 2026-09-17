export const dynamic = 'force-dynamic';

// المرحلة 5 (الصقل التجاري) §Part 1: قائمة الصيدليات (Organization) التي لا
// تملك بعد صف WarehouseCustomer مع هذا المذخر — أساس نافذة "إضافة عميل" في
// app/warehouse/customers/CustomersClient.tsx. تعرض الاسم فقط عمداً: مذخر لا
// يجب أن يرى أي بيانات مالية أو مستخدمين أو أي تفصيل آخر عن منظمة صيدلية لم
// يتعامل معها بعد — فقط اسمها كي يختارها لبدء علاقة تجارية.
// يتطلب canEditCustomerTerms: هذه القائمة مدخل لإنشاء علاقة تجارية (POST
// /api/warehouse-portal/customers)، لا عرض عام.
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

export async function GET() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canEditCustomerTerms');
        if (!gate.ok) return gate.response;

        const existing = await prisma.warehouseCustomer.findMany({
            where: { warehouseId: ctx.warehouseId },
            select: { organizationId: true },
        });
        const excludeIds = existing.map((c) => c.organizationId);

        const organizations = await prisma.organization.findMany({
            where: excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {},
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
            take: 500,
        });

        return NextResponse.json({ organizations });
    } catch (e: any) {
        console.error('warehouse-portal available-organizations GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب قائمة الصيدليات' }, { status: 500 });
    }
}
