import { Metadata } from 'next';
import { Suspense } from 'react';
import TransfersTable from '@/app/ui/inventory/transfers/table';
import { StartTransferButton } from '@/app/ui/inventory/transfers/buttons';
import { auth } from '@/auth';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';
import { NextResponse } from 'next/server';

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

    return (
        <div className="glass-card w-full p-6">
            <div className="flex w-full items-center justify-between">
                <h1 className="text-2xl font-bold">التحويلات بين الأفرع</h1>
                <StartTransferButton />
            </div>

            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                أرسل واستقبل الأدوية بين أفرع صيدليتك بأمان. يتم خصم البضاعة عند الإرسال، ولا تضاف للفرع الآخر إلا بعد التأكد والاستلام.
            </p>

            {/* Tabs */}
            <div className="mt-6 flex border-b border-border">
                <a
                    href={`/dashboard/inventory/transfers?tab=incoming&query=${query}`}
                    className={`px-4 py-2 font-bold ${tab === 'incoming'
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    تحويلات واردة (استلام)
                </a>
                <a
                    href={`/dashboard/inventory/transfers?tab=outgoing&query=${query}`}
                    className={`px-4 py-2 font-bold ${tab === 'outgoing'
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    تحويلات صادرة (إرسال)
                </a>
            </div>

            <div className="mt-6 flex items-center justify-between gap-2 md:mt-8">
                <form method="GET" className="flex w-full md:w-1/3 gap-4">
                    <input type="hidden" name="tab" value={tab} />
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            name="query"
                            defaultValue={query}
                            placeholder="🔍 بحث في التحويلات..."
                            className="peer block w-full rounded-md border border-border py-[9px] px-4 text-sm outline-2 placeholder:text-muted-foreground"
                        />
                    </div>
                    <button type="submit" className="rounded-md bg-card border border-border px-4 py-2 text-sm font-bold text-foreground hover:bg-muted">
                        بحث
                    </button>
                </form>
            </div>

            <div className="mt-4">
                <Suspense fallback={<div>جاري تحميل بيانات التحويلات...</div>}>
                    <TransfersTable query={query} currentPage={currentPage} tab={tab} branchId={branchId} />
                </Suspense>
            </div>
        </div>
    );
}
