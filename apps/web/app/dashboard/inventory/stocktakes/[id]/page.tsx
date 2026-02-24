import { Metadata } from 'next';
import StocktakeForm from '@/app/ui/inventory/stocktakes/stocktake-form';
import { prisma } from '@/app/lib/prisma';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';

export const metadata: Metadata = {
    title: 'تسوية الجرد | Faramace',
};

export default async function Page({ params }: { params: { id: string } }) {
    const session = await auth();
    const branchId = session?.user?.branchId;

    const stocktake = await prisma.stocktake.findUnique({
        where: { id: params.id, branchId: branchId || undefined },
        include: {
            items: true // currently saved items if it was started before
        }
    });

    if (!stocktake) {
        notFound();
    }

    // Get all current inventory for this branch to start the counting process
    const inventory = await prisma.inventory.findMany({
        where: { branchId: branchId || undefined },
        include: {
            drug: true,
            batches: {
                where: { quantity: { gt: 0 } } // Only active/available batches to count
            }
        }
    });

    // Flatten the inventory into a list of batches with drug info
    const allBatches = inventory.flatMap((inv: any) =>
        inv.batches.map((batch: any) => ({
            batchId: batch.id,
            drugName: inv.drug.tradeName,
            barcode: inv.drug.barcode,
            scientificName: inv.drug.scientificName,
            systemQuantity: batch.quantity,
            costPrice: batch.costPrice || inv.cost,
            expiryDate: batch.expiryDate,
            // Default actual to system initially, unless we saved a draft
            actualQuantity: stocktake.items.find((item: any) => item.batchId === batch.id)?.actualQuantity ?? batch.quantity,
            reason: stocktake.items.find((item: any) => item.batchId === batch.id)?.reason ?? '',
        }))
    );

    return (
        <div className="w-full">
            <div className="bg-card p-4 md:p-6 mb-6 rounded-lg border border-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <span>📋</span>
                        تسوية الجرد
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">الرقم المرجعي: <span className="font-mono text-foreground">{stocktake.id}</span></p>
                </div>
                <div className="flex gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${stocktake.status === 'PENDING' ? 'bg-warning/10 text-amber-800' : 'bg-success/10 text-green-800'
                        }`}>
                        {stocktake.status === 'PENDING' ? 'قيد المراجعة والإدخال' : 'مكتمل ومُرحّل'}
                    </span>
                </div>
            </div>

            <StocktakeForm stocktakeId={stocktake.id} initialData={allBatches} isCompleted={stocktake.status === 'COMPLETED'} />
        </div>
    );
}
