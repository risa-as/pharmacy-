import { getSafes, getSafesForOrg } from '@/app/lib/actions/finance-actions';
import { AddSafeModal, TransferModal, VoucherModal } from '@/app/ui/finance/safe-modals';
import { Wallet, Landmark, Smartphone, Briefcase, PlusCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SafesPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');

    // Resolve the branch used for creating new safes.
    // Branch-scoped users use their own branch; org-level admins fall back to
    // the organization's first branch.
    let branchId = tenantCtx.user.branchId;
    if (!branchId && tenantCtx.organizationId) {
        const firstBranch = await prisma.branch.findFirst({
            where: { organizationId: tenantCtx.organizationId },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
        });
        branchId = firstBranch?.id;
    }

    // Branch-scoped users see their branch's safes; org admins see all org safes.
    const safes = tenantCtx.user.branchId
        ? await getSafes(tenantCtx.user.branchId)
        : tenantCtx.organizationId
            ? await getSafesForOrg(tenantCtx.organizationId)
            : [];

    const getIcon = (type: string) => {
        switch (type) {
            case 'BANK': return <Landmark className="w-8 h-8 text-primary" />;
            case 'MOBILE_WALLET': return <Smartphone className="w-8 h-8 text-info" />;
            case 'VAULT': return <Briefcase className="w-8 h-8 text-slate-800" />;
            default: return <Wallet className="w-8 h-8 text-success" />;
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'BANK': return 'حساب بنكي';
            case 'MOBILE_WALLET': return 'محفظة إلكترونية';
            case 'VAULT': return 'خزنة رئيسية';
            default: return 'درج نقدي';
        }
    };

    const totalBalance = safes.reduce((sum: number, safe: any) => sum + safe.balance, 0);

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <div className="flex justify-between items-center bg-card p-6 rounded-2xl shadow-sm border border-border">
                <div>
                    <h1 className="text-2xl font-bold font-cairo flex items-center gap-3 text-foreground">
                        <Wallet className="w-8 h-8 text-info" />
                        صناديق الأموال والمحافظ
                    </h1>
                    <p className="text-muted-foreground mt-1">إدارة الأرصدة النقدية وحركة الأموال بين الحسابات</p>
                </div>
                <div className="text-left bg-info/10 p-4 rounded-xl border border-info/20">
                    <p className="text-sm text-info font-bold mb-1">إجمالي السيولة النقدية</p>
                    <p className="text-3xl font-bold text-info">{totalBalance.toLocaleString()} <span className="text-lg">د.ع</span></p>
                </div>
            </div>

            <div className="flex flex-wrap gap-3">
                {branchId && <AddSafeModal branchId={branchId} />}
                <TransferModal safes={safes} />
                <VoucherModal type="IN" safes={safes} />
                <VoucherModal type="OUT" safes={safes} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {safes.map((safe: any) => (
                    <div key={safe.id} className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden hover:shadow-md transition-shadow">
                        <div className="p-6 flex items-start gap-4">
                            <div className="p-3 bg-muted rounded-xl">
                                {getIcon(safe.type)}
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-lg text-foreground">{safe.name}</h3>
                                <p className="text-sm text-muted-foreground mb-4">{getTypeLabel(safe.type)}</p>

                                <div className="bg-muted p-3 rounded-lg flex justify-between items-center mb-4">
                                    <span className="text-muted-foreground text-sm">الرصيد الحالي:</span>
                                    <span className="font-bold text-xl text-foreground" dir="ltr">
                                        {safe.balance.toLocaleString()} <span className="text-sm text-muted-foreground">IQD</span>
                                    </span>
                                </div>

                                <div className="text-xs text-muted-foreground mt-2 flex justify-between">
                                    <span>تاريخ الإنشاء:</span>
                                    <span>{format(new Date(safe.createdAt), 'PPP', { locale: ar })}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {safes.length === 0 && (
                <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
                    <Wallet className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-muted-foreground mb-2">لا توجد صناديق مضافة</h3>
                    <p className="text-muted-foreground mb-6">ابدأ بإضافة درج الكاشير أو الحساب البنكي لمتابعة الأموال.</p>
                    {branchId && <AddSafeModal branchId={branchId} />}
                </div>
            )}
        </div>
    );
}
