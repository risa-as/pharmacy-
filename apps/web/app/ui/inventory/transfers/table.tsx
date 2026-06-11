import { prisma } from '@/app/lib/prisma';
import { ReceiveTransferButton, TransferStatus } from './buttons';
import { ArrowUpRight, ArrowDownLeft, PackageOpen, ChevronRight, ChevronLeft } from 'lucide-react';

const ITEMS_PER_PAGE = 20;

export default async function TransfersTable({
    query,
    currentPage,
    tab,
    branchId
}: {
    query: string;
    currentPage: number;
    tab: string; // 'incoming' | 'outgoing'
    branchId: string;
}) {
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;

    const whereClause: any = tab === 'incoming'
        ? { toBranchId: branchId }
        : { fromBranchId: branchId };

    if (query) {
        whereClause.OR = [
            { items: { some: { drug: { tradeName: { contains: query, mode: 'insensitive' } } } } },
            { fromBranch: { name: { contains: query, mode: 'insensitive' } } },
            { toBranch: { name: { contains: query, mode: 'insensitive' } } },
        ];
    }

    const [transfers, totalCount] = await Promise.all([
        prisma.transfer.findMany({
            where: whereClause,
            include: {
                fromBranch: { select: { name: true } },
                toBranch: { select: { name: true } },
                items: { include: { drug: { select: { tradeName: true, barcode: true } } } },
            },
            orderBy: { createdAt: 'desc' },
            take: ITEMS_PER_PAGE,
            skip: offset,
        }),
        prisma.transfer.count({ where: whereClause }),
    ]);

    if (transfers.length === 0) {
        return (
            <div className="py-16 text-center">
                <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <PackageOpen className="w-8 h-8 text-muted-foreground opacity-50" />
                </div>
                <p className="text-foreground font-medium">
                    {query ? 'لا توجد نتائج مطابقة' : 'لا توجد تحويلات مسجلة'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                    {query ? 'جرّب كلمة بحث أخرى' : tab === 'incoming' ? 'لم يصلك أي تحويل بعد' : 'لم ترسل أي تحويل بعد'}
                </p>
            </div>
        );
    }

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
    const pageUrl = (p: number) =>
        `/dashboard/inventory/transfers?tab=${tab}&query=${encodeURIComponent(query)}&page=${p}`;

    return (
        <div>
            <div className="overflow-x-auto">
                <table className="w-full text-right text-sm text-foreground">
                    <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                        <tr>
                            <th scope="col" className="px-6 py-3.5 font-medium font-cairo">رقم التحويل</th>
                            <th scope="col" className="px-6 py-3.5 font-medium font-cairo">الاتجاه</th>
                            <th scope="col" className="px-6 py-3.5 font-medium font-cairo w-1/3">تفاصيل الأدوية</th>
                            <th scope="col" className="px-6 py-3.5 font-medium font-cairo">الأصناف</th>
                            <th scope="col" className="px-6 py-3.5 font-medium font-cairo">الحالة</th>
                            <th scope="col" className="px-6 py-3.5 font-medium font-cairo">التاريخ</th>
                            <th scope="col" className="px-6 py-3.5 font-medium font-cairo text-center">الإجراء</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                        {transfers.map((transfer: any) => {
                            const isIncoming = transfer.toBranchId === branchId;
                            const isPendingReceive = isIncoming && transfer.status === 'IN_TRANSIT';
                            const totalUnits = transfer.items.reduce((acc: number, item: any) => acc + item.quantity, 0);

                            return (
                                <tr key={transfer.id} className="hover:bg-muted/40 transition-colors">
                                    <td className="whitespace-nowrap px-6 py-4 font-mono text-muted-foreground text-xs" dir="ltr">
                                        #{transfer.id.slice(0, 8).toUpperCase()}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 font-bold">
                                        {isIncoming ? (
                                            <span className="inline-flex items-center gap-1.5 text-primary">
                                                <ArrowDownLeft className="h-4 w-4 shrink-0" />
                                                من: {transfer.fromBranch.name}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 text-destructive">
                                                <ArrowUpRight className="h-4 w-4 shrink-0" />
                                                إلى: {transfer.toBranch.name}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-muted-foreground">
                                        <ul className="space-y-0.5 max-h-20 overflow-y-auto">
                                            {transfer.items.map((item: any, idx: number) => (
                                                <li key={idx} className="truncate" title={`${item.quantity}x ${item.drug.tradeName}`}>
                                                    <span className="font-bold text-foreground">{item.quantity}×</span>{' '}
                                                    {item.drug.tradeName}{' '}
                                                    <span className="text-muted-foreground/60 font-mono">(دفعة: {item.batchNumber})</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4">
                                        <span className="inline-flex items-center text-sm text-muted-foreground bg-muted rounded-md px-2.5 py-1">
                                            {totalUnits} عبوة
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4">
                                        <TransferStatus status={transfer.status} />
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 text-muted-foreground text-xs" dir="ltr">
                                        {new Date(transfer.createdAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 text-center">
                                        {isPendingReceive ? (
                                            <ReceiveTransferButton id={transfer.id} isReceiving={true} />
                                        ) : (
                                            <span className="text-muted-foreground/40 text-xs">—</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* الترقيم */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                        صفحة {currentPage} من {totalPages} — {totalCount} تحويل
                    </span>
                    <div className="flex items-center gap-2">
                        {currentPage > 1 ? (
                            <a
                                href={pageUrl(currentPage - 1)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                                السابق
                            </a>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground/40 cursor-not-allowed">
                                <ChevronRight className="w-4 h-4" />
                                السابق
                            </span>
                        )}
                        {currentPage < totalPages ? (
                            <a
                                href={pageUrl(currentPage + 1)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                            >
                                التالي
                                <ChevronLeft className="w-4 h-4" />
                            </a>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground/40 cursor-not-allowed">
                                التالي
                                <ChevronLeft className="w-4 h-4" />
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
