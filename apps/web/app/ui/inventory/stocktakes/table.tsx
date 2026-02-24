import { EyeIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

export default async function StocktakesTable({
    query,
    currentPage,
}: {
    query: string;
    currentPage: number;
}) {
    const session = await auth();
    const branchId = session?.user?.branchId;

    if (!branchId) return <div>لا يوجد فرع محدد</div>;

    const stocktakes = await prisma.stocktake.findMany({
        where: {
            branchId: branchId,
        },
        include: {
            user: { select: { name: true } },
            _count: { select: { items: true } }
        },
        orderBy: {
            createdAt: 'desc',
        },
    });

    return (
        <div className="mt-6 flow-root">
            <div className="inline-block min-w-full align-middle">
                <div className="rounded-lg bg-transparent p-2 md:pt-0">

                    <table className="hidden min-w-full text-foreground md:table">
                        <thead className="rounded-lg text-right text-sm font-normal">
                            <tr>
                                <th scope="col" className="px-4 py-5 font-medium sm:pl-6">
                                    رقم الجرد
                                </th>
                                <th scope="col" className="px-3 py-5 font-medium">
                                    التاريخ
                                </th>
                                <th scope="col" className="px-3 py-5 font-medium">
                                    الموظف
                                </th>
                                <th scope="col" className="px-3 py-5 font-medium">
                                    الحالة
                                </th>
                                <th scope="col" className="px-3 py-5 font-medium">
                                    الفرق المالي (خسارة/زيادة)
                                </th>
                                <th scope="col" className="relative py-3 pl-6 pr-3">
                                    <span className="sr-only">إجراءات</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-transparent text-right">
                            {stocktakes?.map((stocktake: any) => (
                                <tr
                                    key={stocktake.id}
                                    className="w-full border-b border-border py-3 text-sm last-of-type:border-none [&:first-child>td:first-child]:rounded-tr-lg [&:first-child>td:last-child]:rounded-tl-lg [&:last-child>td:first-child]:rounded-br-lg [&:last-child>td:last-child]:rounded-bl-lg"
                                >
                                    <td className="whitespace-nowrap py-3 pl-6 pr-3">
                                        <div className="flex items-center gap-3">
                                            <p className="font-medium text-foreground">
                                                {stocktake.id.slice(0, 8).toUpperCase()}
                                            </p>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3">
                                        {new Date(stocktake.createdAt).toLocaleDateString('ar-IQ')} {new Date(stocktake.createdAt).toLocaleTimeString('ar-IQ')}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3">
                                        {stocktake.user?.name || 'غير معروف'}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3">
                                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${stocktake.status === 'PENDING' ? 'bg-warning/10 text-warning ring-warning/20' :
                                            'bg-success/10 text-success ring-success/20'
                                            }`}>
                                            {stocktake.status === 'PENDING' ? 'قيد الإجراء' : 'مكتمل'}
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3 font-bold dir-ltr text-left">
                                        {stocktake.status === 'COMPLETED' ? (
                                            <span className={stocktake.totalDiscrepancyAmount < 0 ? 'text-destructive' : stocktake.totalDiscrepancyAmount > 0 ? 'text-success' : 'text-muted-foreground'}>
                                                {stocktake.totalDiscrepancyAmount.toLocaleString()} د.ع
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">قيد الحساب...</span>
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap py-3 pl-6 pr-3">
                                        <div className="flex justify-end gap-3">
                                            <Link
                                                href={`/dashboard/inventory/stocktakes/${stocktake.id}`}
                                                className={`rounded-md border p-2 hover:bg-muted ${stocktake.status === 'PENDING' ? 'text-primary border-primary/20 bg-primary/10' : ''}`}
                                                title={stocktake.status === 'PENDING' ? 'متابعة الجرد' : 'عرض التفاصيل'}
                                            >
                                                <EyeIcon className="w-5" />
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {stocktakes.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                                        لا يوجد سجلات جرد سابقة.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
