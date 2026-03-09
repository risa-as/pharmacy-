import { prisma } from '@/app/lib/prisma';
import { ReceiveTransferButton, TransferStatus } from './buttons';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';

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
    const ITEMS_PER_PAGE = 20;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;

    let whereClause: any = {};
    if (tab === 'incoming') {
        whereClause = { toBranchId: branchId };
    } else {
        whereClause = { fromBranchId: branchId };
    }

    const transfers = await prisma.transfer.findMany({
        where: whereClause,
        include: {
            fromBranch: { select: { name: true } },
            toBranch: { select: { name: true } },
            items: {
                include: {
                    drug: { select: { tradeName: true, barcode: true } }
                }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: ITEMS_PER_PAGE,
        skip: offset
    });

    if (transfers.length === 0) {
        return (
            <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-transparent py-12 text-center h-64">
                <p className="text-muted-foreground font-medium">لا توجد تحويلات مسجلة.</p>
            </div>
        );
    }

    return (
        <div className="mt-6 flow-root">
            <div className="inline-block min-w-full align-middle">
                <div className="rounded-lg bg-transparent p-2 md:pt-0 border border-border shadow-sm overflow-hidden">
                    <table className="hidden min-w-full text-foreground md:table text-right text-sm">
                        <thead className="rounded-lg bg-card/50 font-medium text-muted-foreground">
                            <tr>
                                <th scope="col" className="px-4 py-3">رقم التحويل</th>
                                <th scope="col" className="px-3 py-3">الاتجاه</th>
                                <th scope="col" className="px-3 py-3 w-1/3">تفاصيل الأدوية</th>
                                <th scope="col" className="px-3 py-3">إجمالي الأصناف</th>
                                <th scope="col" className="px-3 py-3">حالة الشحنة</th>
                                <th scope="col" className="px-3 py-3">تاريخ التحويل</th>
                                <th scope="col" className="px-3 py-3">الإجراء</th>
                            </tr>
                        </thead>
                        <tbody className="bg-transparent">
                            {transfers.map((transfer: any) => {
                                const isIncoming = transfer.toBranchId === branchId;
                                const isPendingReceive = isIncoming && transfer.status === 'IN_TRANSIT';

                                return (
                                    <tr key={transfer.id} className="w-full border-b border-border py-3 text-sm last-of-type:border-none hover:bg-muted/50 transition-colors">
                                        <td className="whitespace-nowrap px-4 py-3 font-mono text-muted-foreground">
                                            #{transfer.id.slice(0, 8).toUpperCase()}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3 text-foreground font-bold">
                                            {isIncoming ? (
                                                <div className="flex items-center text-primary">
                                                    <ArrowDownLeft className="h-4 w-4 ml-1" />
                                                    وارد من: {transfer.fromBranch.name}
                                                </div>
                                            ) : (
                                                <div className="flex items-center text-destructive">
                                                    <ArrowUpRight className="h-4 w-4 ml-1" />
                                                    صادر إلى: {transfer.toBranch.name}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-xs text-muted-foreground">
                                            <ul className="list-disc list-inside max-h-16 overflow-y-auto">
                                                {transfer.items.map((item: any, idx: any) => (
                                                    <li key={idx} className="truncate" title={`${item.quantity}x ${item.drug.tradeName}`}>
                                                        <span className="font-bold text-foreground">{item.quantity}x</span> {item.drug.tradeName} <span className="text-muted-foreground/60 font-mono">(دفعة: {item.batchNumber})</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3 font-bold text-foreground">
                                            {transfer.items.reduce((acc: any, item: any) => acc + item.quantity, 0)} عبوة
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3">
                                            <TransferStatus status={transfer.status} />
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground" dir="ltr">
                                            {new Date(transfer.createdAt).toLocaleString('ar-IQ')}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3 text-right">
                                            {isPendingReceive ? (
                                                <ReceiveTransferButton id={transfer.id} isReceiving={true} />
                                            ) : (
                                                <span className="text-muted-foreground/40 text-xs">لا يوجد إجراء</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
