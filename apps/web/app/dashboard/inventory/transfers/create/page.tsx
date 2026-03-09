export const dynamic = 'force-dynamic';

import { Metadata } from 'next';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import CreateTransferForm from '@/app/ui/inventory/transfers/create-form';

export const metadata: Metadata = {
    title: 'تحويل جديد | Faramace',
};

export default async function Page() {
    const session = await auth();
    const branchId = session?.user?.branchId;

    if (!branchId) return <div>يرجى تسجيل الدخول</div>;

    // Fetch branches to select from (exclude current branch)
    const branches = await prisma.branch.findMany({
        where: { id: { not: branchId } },
        select: { id: true, name: true }
    });

    // Fetch available inventory with positive batches for the current branch
    const inventory = await prisma.inventory.findMany({
        where: {
            branchId,
            batches: {
                some: { quantity: { gt: 0 } }
            }
        },
        include: {
            drug: { select: { id: true, tradeName: true, barcode: true } },
            batches: {
                where: { quantity: { gt: 0 } }
            }
        }
    });

    // Flatten data for the client component
    const availableStock = inventory.flatMap((inv: any) =>
        inv.batches.map((batch: any) => ({
            drugId: inv.drug.id,
            tradeName: inv.drug.tradeName,
            barcode: inv.drug.barcode,
            batchNumber: batch.batchNumber,
            expiryDate: batch.expiryDate,
            availableQuantity: batch.quantity,
            costPrice: batch.costPrice
        }))
    );

    return (
        <main className="w-full">
            <h1 className="text-2xl font-bold mb-8">إنشاء تحويل صادر جديد</h1>
            <p className="text-sm text-muted-foreground mb-6">احرص على مراجعة الكميات المحددة، بمجرد الإرسال سيتم إخراج الأدوية من مخزونك الحالي وستبقى معلقة لحين استلامها من الفرع الآخر.</p>

            <div className="bg-card rounded-lg p-6 shadow-sm border border-border">
                <CreateTransferForm branches={branches} availableStock={availableStock} />
            </div>
        </main>
    );
}
