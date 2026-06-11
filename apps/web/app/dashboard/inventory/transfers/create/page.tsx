export const dynamic = 'force-dynamic';

import { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { ArrowRight, Building2 } from 'lucide-react';
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
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center gap-3">
                <Link
                    href="/dashboard/inventory/transfers"
                    className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground">إنشاء تحويل صادر جديد</h1>
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                        بمجرد الإرسال تُخرَج الأدوية من مخزونك الحالي وتبقى معلّقة لحين استلامها من الفرع الآخر.
                    </p>
                </div>
            </div>

            {branches.length === 0 ? (
                <div className="glass-card py-16 text-center">
                    <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Building2 className="w-8 h-8 text-muted-foreground opacity-50" />
                    </div>
                    <p className="text-foreground font-medium">لا يوجد فرع آخر للتحويل إليه</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        التحويلات تتطلب وجود فرعين على الأقل في مؤسستك.
                    </p>
                </div>
            ) : (
                <div className="glass-card p-6">
                    <CreateTransferForm branches={branches} availableStock={availableStock} />
                </div>
            )}
        </div>
    );
}
