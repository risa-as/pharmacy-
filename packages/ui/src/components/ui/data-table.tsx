'use client';

import * as React from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getPaginationRowModel,
    flexRender,
    type ColumnDef,
    type PaginationState,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface DataTableProps<TData> {
    columns: ColumnDef<TData, any>[];
    data: TData[];
    /** Show animated skeleton rows while data loads */
    loading?: boolean;
    /** Message shown when data is empty */
    emptyMessage?: string;
    /** Called when a row is clicked or activated via Enter */
    onRowClick?: (row: TData) => void;
    /** Enable built-in pagination controls */
    pagination?: boolean;
    /** Rows per page (default 10) */
    pageSize?: number;
    className?: string;
}

export function DataTable<TData>({
    columns,
    data,
    loading = false,
    emptyMessage = 'لا توجد بيانات',
    onRowClick,
    pagination = false,
    pageSize = 10,
    className,
}: DataTableProps<TData>) {
    const [paginationState, setPaginationState] = React.useState<PaginationState>({
        pageIndex: 0,
        pageSize,
    });

    /** Index of the keyboard-focused row (−1 = none) */
    const [focusedRow, setFocusedRow] = React.useState<number>(-1);

    const table = useReactTable<TData>({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        ...(pagination
            ? {
                  getPaginationRowModel: getPaginationRowModel(),
                  onPaginationChange: setPaginationState,
                  state: { pagination: paginationState },
              }
            : {}),
    });

    const rows = table.getRowModel().rows;

    const handleRowKeyDown = (
        e: React.KeyboardEvent<HTMLTableRowElement>,
        rowIndex: number,
        original: TData,
    ) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedRow(Math.min(rowIndex + 1, rows.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedRow(Math.max(rowIndex - 1, 0));
        } else if (e.key === 'Enter') {
            onRowClick?.(original);
        } else if (e.key === 'Escape') {
            setFocusedRow(-1);
            (e.currentTarget as HTMLElement).blur();
        }
    };

    /* Sync focus to the DOM row element when focusedRow changes */
    const rowRefs = React.useRef<(HTMLTableRowElement | null)[]>([]);
    React.useEffect(() => {
        if (focusedRow >= 0 && rowRefs.current[focusedRow]) {
            rowRefs.current[focusedRow]?.focus({ preventScroll: false });
        }
    }, [focusedRow]);

    return (
        <div className={cn('w-full', className)}>
            {/* ── Table ──────────────────────────────────────────────── */}
            <div className="rounded-xl border border-border overflow-hidden bg-card text-card-foreground">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        {/* Head */}
                        <thead className="bg-muted/50 border-b border-border">
                            {table.getHeaderGroups().map((hg) => (
                                <tr key={hg.id}>
                                    {hg.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap"
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef.header,
                                                      header.getContext(),
                                                  )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>

                        {/* Body */}
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                /* Skeleton */
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={`skel-${i}`}>
                                        {columns.map((_, ci) => (
                                            <td key={ci} className="px-4 py-3">
                                                <div className="h-4 rounded bg-muted animate-pulse" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : rows.length === 0 ? (
                                /* Empty */
                                <tr>
                                    <td colSpan={columns.length} className="py-16 text-center">
                                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                            <Inbox className="w-10 h-10 opacity-40" />
                                            <p className="text-sm font-medium">{emptyMessage}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                /* Rows */
                                rows.map((row, rowIndex) => (
                                    <tr
                                        key={row.id}
                                        ref={(el) => { rowRefs.current[rowIndex] = el; }}
                                        tabIndex={0}
                                        onClick={() => onRowClick?.(row.original)}
                                        onFocus={() => setFocusedRow(rowIndex)}
                                        onBlur={() => setFocusedRow(-1)}
                                        onKeyDown={(e) =>
                                            handleRowKeyDown(e, rowIndex, row.original)
                                        }
                                        className={cn(
                                            'outline-none transition-colors',
                                            onRowClick && 'cursor-pointer hover:bg-accent/50',
                                            focusedRow === rowIndex &&
                                                'ring-2 ring-inset ring-ring bg-accent/70',
                                        )}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td key={cell.id} className="px-4 py-3 text-foreground">
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext(),
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Pagination ─────────────────────────────────────────── */}
            {pagination && (
                <div className="flex items-center justify-between px-1 pt-3 text-sm text-muted-foreground">
                    <span>
                        صفحة {table.getState().pagination.pageIndex + 1} من{' '}
                        {table.getPageCount() || 1}
                    </span>
                    <div className="flex gap-1">
                        <button
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                            className={cn(
                                'p-1.5 rounded-md border border-border hover:bg-accent transition-colors',
                                'disabled:opacity-40 disabled:cursor-not-allowed',
                            )}
                            aria-label="الصفحة السابقة"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                            className={cn(
                                'p-1.5 rounded-md border border-border hover:bg-accent transition-colors',
                                'disabled:opacity-40 disabled:cursor-not-allowed',
                            )}
                            aria-label="الصفحة التالية"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export type { ColumnDef };
