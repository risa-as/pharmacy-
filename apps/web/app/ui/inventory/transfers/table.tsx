import { prisma } from '@/app/lib/prisma';
import { ReceiveTransferButton, TransferStatus } from './buttons';
import { ArrowUpRight, ArrowDownLeft, PackageOpen } from 'lucide-react';
import TableSearch from '@/app/ui/table-search';
import TablePagination from '@/app/ui/table-pagination';
import {
    TableToolbar, ResultCount, DataTable, THead, Th, TBody, rowClass, cellClass, EmptyState, DateTimeCell,
} from '@/app/ui/data-table';

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

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
    const pageUrl = (p: number) =>
        `/dashboard/inventory/transfers?tab=${tab}&query=${encodeURIComponent(query)}&page=${p}`;

    // Same layout and styling as the batches table: search bar, table, pagination.
    return (
        <div>
            <TableToolbar>
                <TableSearch currentQuery={query} placeholder="بحث باسم دواء أو فرع..." />
                <ResultCount total={totalCount} query={query} unit="تحويل" />
            </TableToolbar>

            {transfers.length === 0 ? (
                <EmptyState
                    icon={<PackageOpen />}
                    title={query ? 'لا توجد نتائج للبحث' : 'لا توجد تحويلات مسجلة'}
                    hint={query ? 'جرّب كلمة بحث أخرى' : tab === 'incoming' ? 'لم يصلك أي تحويل بعد' : 'لم ترسل أي تحويل بعد'}
                />
            ) : (
                <DataTable>
                    <THead>
                        <Th>رقم التحويل</Th>
                        <Th>الاتجاه</Th>
                        <Th>الأدوية</Th>
                        <Th>الكمية</Th>
                        <Th>الحالة</Th>
                        <Th>التاريخ</Th>
                        <Th center>الإجراء</Th>
                    </THead>
                    <TBody>
                        {transfers.map((transfer: any) => {
                            const isIncoming = transfer.toBranchId === branchId;
                            const isPendingReceive = isIncoming && transfer.status === 'IN_TRANSIT';
                            const totalUnits = transfer.items.reduce((acc: number, item: any) => acc + item.quantity, 0);
                            const lines: string[] = transfer.items.map((item: any) => `${item.quantity}× ${item.drug.tradeName} (دفعة: ${item.batchNumber})`);
                            const first = transfer.items[0];
                            const others = transfer.items.length - 1;

                            return (
                                <tr key={transfer.id} className={rowClass}>
                                    <td className={`${cellClass} font-mono font-bold text-primary whitespace-nowrap`} dir="ltr">
                                        {transfer.documentNumber}
                                    </td>
                                    <td className={`${cellClass} whitespace-nowrap font-semibold`}>
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
                                    <td className={cellClass}>
                                        <div className="max-w-[240px]" title={lines.join('\n')}>
                                            <p className="font-semibold text-foreground truncate">
                                                {first ? `${first.quantity}× ${first.drug.tradeName}` : '—'}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground truncate">
                                                {first ? `دفعة ${first.batchNumber}` : ''}
                                                {others > 0 ? ` · و ${others} ${others === 1 ? 'صنف آخر' : 'أصناف أخرى'}` : ''}
                                            </p>
                                        </div>
                                    </td>
                                    <td className={`${cellClass} text-muted-foreground whitespace-nowrap`}>
                                        <span className="font-bold text-foreground">{totalUnits}</span> عبوة
                                    </td>
                                    <td className={cellClass}>
                                        <TransferStatus status={transfer.status} />
                                    </td>
                                    <td className={cellClass}>
                                        <DateTimeCell date={transfer.createdAt} />
                                    </td>
                                    <td className={`${cellClass} text-center`}>
                                        {isPendingReceive ? (
                                            <ReceiveTransferButton id={transfer.id} isReceiving={true} />
                                        ) : (
                                            <span className="text-muted-foreground/40 text-xs">—</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </TBody>
                </DataTable>
            )}

            <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                unit="تحويل"
                hrefFor={pageUrl}
            />
        </div>
    );
}
