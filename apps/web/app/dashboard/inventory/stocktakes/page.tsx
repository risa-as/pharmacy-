import { Metadata } from 'next';
import { Suspense } from 'react';
import StocktakesTable from '@/app/ui/inventory/stocktakes/table';
import { StartStocktakeButton } from '@/app/ui/inventory/stocktakes/buttons';

export const metadata: Metadata = {
    title: 'جرد المخزون | Faramace',
};

export default async function Page({
    searchParams,
}: {
    searchParams?: {
        query?: string;
        page?: string;
    };
}) {
    const query = searchParams?.query || '';
    const currentPage = Number(searchParams?.page) || 1;

    return (
        <div className="glass-card w-full p-6">
            <div className="flex w-full items-center justify-between">
                <h1 className="text-2xl font-bold">جرد وتسوية المخزون</h1>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 md:mt-8">
                <div className="w-full md:w-1/3">
                    {/* Add a generic search if we plan to search stocktakes by notes or ID later. */}
                    <div className="relative">
                        <input disabled placeholder="البحث معطل حالياً..." className="peer block w-full rounded-md border border-border py-[9px] pl-10 text-sm outline-2 placeholder:text-muted-foreground" />
                    </div>
                </div>
                <StartStocktakeButton />
            </div>
            <div className="mt-6 flex flex-col gap-4">
                <div className="bg-warning/10 p-4 rounded-md border border-amber-200 text-amber-800 text-sm">
                    <h4 className="font-bold flex items-center gap-2 mb-1">
                        <span>⚠️</span>
                        تنبيه هام
                    </h4>
                    <p className="opacity-90">
                        عملية الجرد تؤثر مباشرة على أرصدة المستودع والتقارير المالية. في حالة وجود نقص (فروقات بالسالب) سيتم خصم تكلفتها من الأرباح وتسجيلها كـ "نواقص وتوالف الجرد" في المصروفات.
                    </p>
                </div>
            </div>

            <div className="w-full mt-6">
                <Suspense fallback={<div>جاري تحميل بيانات الجرد...</div>}>
                    <StocktakesTable query={query} currentPage={currentPage} />
                </Suspense>
            </div>
        </div>
    );
}
