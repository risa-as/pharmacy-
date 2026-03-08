export const dynamic = 'force-dynamic';

import { Metadata } from 'next';
import { Suspense } from 'react';
import BulkPricingClient from '@/app/ui/inventory/bulk-pricing/client';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

export const metadata: Metadata = {
    title: 'مدير التسعير الشامل | Faramace',
};

export default async function Page() {
    const session = await auth();
    const branchId = session?.user?.branchId;

    if (!branchId) return <div>لا يوجد فرع محدد</div>;

    // Pre-fetch all available inventory for this branch to initially populate the client table
    // Can get heavy on large DBs, might want to limit or paginate in a real scenario,
    // but for bulk updating, having them locally in RAM allows instant preview/filtering.
    const inventoryData = await prisma.inventory.findMany({
        where: { branchId },
        include: {
            drug: true,
            batches: true
        },
        orderBy: { drug: { tradeName: 'asc' } }
    });

    const suppliers = await prisma.supplier.findMany({
        orderBy: { name: 'asc' }
    });

    // Map the flattened structure needed for the UI
    const mappedInventory = inventoryData.map((inv: any) => {
        // Collect supplier IDs from past purchases of this drug to allow filtering by Supplier
        // A robust way mapping is if purchases actually saved the supplier ID on the drug level
        // For now we'll just allow basic filtering or pass supplier data if available
        return {
            id: inv.id,
            drugId: inv.drugId,
            tradeName: inv.drug.tradeName,
            barcode: inv.drug.barcode,
            cost: inv.cost,
            price: inv.price,
            stock: inv.batches.reduce((sum: any, b: any) => sum + b.quantity, 0)
        };
    });

    return (
        <div className="glass-card w-full p-6">
            <div className="flex w-full items-center justify-between">
                <h1 className="text-2xl font-bold">مدير التسعير الشامل</h1>
            </div>

            <p className="mt-2 text-sm text-muted-foreground">
                أداة سريعة لزيادة أو إنقاص أسعار البيع لمجموعة من الأدوية دفعة واحدة. حدد المنتجات، اختر نسبة الزيادة والمقدار، ثم قم بتطبيق التغييرات.
            </p>

            <div className="mt-6">
                <Suspense fallback={<div className="p-8 text-center text-muted-foreground">جاري تحميل بيانات المخزون...</div>}>
                    <BulkPricingClient inventory={mappedInventory} suppliers={suppliers} />
                </Suspense>
            </div>
        </div>
    );
}
