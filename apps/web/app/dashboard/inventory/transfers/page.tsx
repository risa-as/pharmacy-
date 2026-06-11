import { Metadata } from 'next';
import { Suspense } from 'react';
import { prisma } from '@/app/lib/prisma';
import TransfersTable from '@/app/ui/inventory/transfers/table';
import { StartTransferButton } from '@/app/ui/inventory/transfers/buttons';
import { auth } from '@/auth';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';
import { NextResponse } from 'next/server';
import { ArrowLeftRight, Search, Clock, ArrowUpRight, CheckCircle2, Loader2 } from 'lucide-react';

export const metadata: Metadata = {
    title: 'تحويلات الأدوية بين الأفرع | Faramace',
};

export default async function Page({
    searchParams,
}: {
    searchParams?: {
        query?: string;
        page?: string;
        tab?: string;
    };
}) {
    const session = await auth();
    const branchId = session?.user?.branchId;

    if (!branchId) return <div>يرجى تسجيل الدخول</div>;

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    if (tenantCtx.organizationId) {
        const upgrade = await requireFeature(tenantCtx.organizationId, 'interBranchTransfers');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    const query = searchParams?.query || '';
    const currentPage = Number(searchParams?.page) || 1;
    const tab = searchParams?.tab || 'incoming'; // incoming or outgoing

    const [pendingIncoming, outgoingInTransit, completedCount] = await Promise.all([
        prisma.transfer.count({ where: { toBranchId: branchId, status: 'IN_TRANSIT' } }),
        prisma.transfer.count({ where: { fromBranchId: branchId, status: 'IN_TRANSIT' } }),
        prisma.transfer.count({
            where: { OR: [{ toBranchId: branchId }, { fromBranchId: branchId }], status: 'COMPLETED' },
        }),
    ]);

    const statCards = [
        { label: 'بانتظار الاستلام', value: pendingIncoming, icon: Clock, tone: 'text-warning', bg: 'bg-warning/10' },
        { label: 'صادرة قيد النقل', value: outgoingInTransit, icon: ArrowUpRight, tone: 'text-primary', bg: 'bg-primary/10' },
        { label: 'تحويلات مكتملة', value: completedCount, icon: CheckCircle2, tone: 'text-success', bg: 'bg-success/10' },
    ];

    const tabs = [
        { key: 'incoming', label: 'تحويلات واردة (استلام)', badge: pendingIncoming },
        { key: 'outgoing', label: 'تحويلات صادرة (إرسال)', badge: outgoingInTransit },
    ];

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <ArrowLeftRight className="w-6 h-6 text-primary" />
                        التحويلات بين الأفرع
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                        تُخصم البضاعة عند الإرسال، ولا تُضاف للفرع الآخر إلا بعد تأكيد الاستلام.
                    </p>
                </div>
                <StartTransferButton />
            </div>

            {/* بطاقات الإحصائيات */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} className="glass-card p-5 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-6 h-6 ${card.tone}`} />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">{card.label}</p>
                                <p className={`text-2xl font-bold ${card.value > 0 ? card.tone : 'text-foreground'}`}>
                                    {card.value}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* الجدول + التبويبات */}
            <div className="glass-card overflow-hidden">
                {/* التبويبات */}
                <div className="flex border-b border-border px-2">
                    {tabs.map((t) => {
                        const active = tab === t.key;
                        return (
                            <a
                                key={t.key}
                                href={`/dashboard/inventory/transfers?tab=${t.key}&query=${encodeURIComponent(query)}`}
                                className={`relative px-4 py-3 text-sm font-bold transition-colors flex items-center gap-2 ${
                                    active
                                        ? 'text-primary'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {t.label}
                                {t.badge > 0 && (
                                    <span className="text-xs bg-warning/15 text-warning rounded-full px-1.5 py-0.5 font-bold">
                                        {t.badge}
                                    </span>
                                )}
                                {active && (
                                    <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary rounded-full" />
                                )}
                            </a>
                        );
                    })}
                </div>

                {/* البحث */}
                <div className="p-4 border-b border-border">
                    <form method="GET" className="relative max-w-sm">
                        <input type="hidden" name="tab" value={tab} />
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <input
                            type="text"
                            name="query"
                            defaultValue={query}
                            placeholder="بحث في التحويلات..."
                            className="w-full pr-10 pl-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                        />
                    </form>
                </div>

                <Suspense
                    fallback={
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    }
                >
                    <TransfersTable query={query} currentPage={currentPage} tab={tab} branchId={branchId} />
                </Suspense>
            </div>
        </div>
    );
}
