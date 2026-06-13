'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, RotateCcw, RefreshCw, Laptop } from 'lucide-react';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    CREATE: { label: 'إنشاء', color: 'bg-success/10 text-success' },
    UPDATE: { label: 'تعديل', color: 'bg-primary/10 text-primary' },
    DELETE: { label: 'حذف', color: 'bg-destructive/10 text-destructive' },
    RETURN: { label: 'مرتجع', color: 'bg-warning/10 text-warning' },
    LOGIN: { label: 'تسجيل دخول', color: 'bg-info/10 text-info' },
    PRICE_CHANGE: { label: 'تغيير سعر', color: 'bg-warning/10 text-warning' },
    TRANSFER: { label: 'تحويل', color: 'bg-info/10 text-info' },
    DEBT_PAYMENT: { label: 'تسديد دين', color: 'bg-success/10 text-success' },
    ADD_BATCH: { label: 'إضافة مخزون', color: 'bg-success/10 text-success' },
    SHIFT_OPEN: { label: 'فتح وردية', color: 'bg-info/10 text-info' },
    SHIFT_CLOSE: { label: 'إغلاق وردية', color: 'bg-muted text-foreground' },
};

const ENTITY_LABELS: Record<string, string> = {
    SALE: 'مبيعات',
    INVENTORY: 'مخزون',
    DRUG: 'دواء',
    USER: 'مستخدم',
    EXPENSE: 'مصاريف',
    TRANSFER: 'تحويل',
    PATIENT: 'مريض',
    SUPPLIER: 'مورد',
    SUPPLIER_PAYMENT: 'دفعة مورد',
    SHIFT: 'وردية',
    PURCHASE: 'مشتريات',
    SETTING: 'إعدادات',
    DEBT: 'دين',
    BATCH: 'دفعة مخزون',
};

// Human-readable labels for the JSON keys stored in `details`. Anything not
// listed (raw IDs, the internal `source` flag) is hidden from the cell.
const DETAIL_LABELS: Record<string, string> = {
    total: 'الإجمالي',
    amount: 'المبلغ',
    quantity: 'الكمية',
    drug: 'الدواء',
    barcode: 'باركود',
    expectedCash: 'المتوقع',
    actualCash: 'الفعلي',
    status: 'الحالة',
    method: 'الطريقة',
    changes: 'التغييرات',
};

const NUMERIC_KEYS = new Set(['total', 'amount', 'quantity', 'expectedCash', 'actualCash']);

/** Turns the stored JSON details into a compact, readable Arabic summary. */
function formatDetails(raw: string | null): string {
    if (!raw) return '—';
    let obj: any;
    try {
        obj = JSON.parse(raw);
    } catch {
        return raw; // not JSON — show as-is
    }
    if (!obj || typeof obj !== 'object') return String(raw);

    const parts: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
        if (key === 'source' || value == null) continue;
        const label = DETAIL_LABELS[key];
        if (!label) continue; // hide raw IDs and unknown internal keys
        let display: string;
        if (NUMERIC_KEYS.has(key) && typeof value === 'number') {
            display = value.toLocaleString('en-US');
        } else if (typeof value === 'object') {
            display = Object.keys(value as object).join('، ');
        } else {
            display = String(value);
        }
        parts.push(`${label}: ${display}`);
    }
    return parts.length ? parts.join(' · ') : '—';
}

/** True when the entry originated from a desktop offline-sync push. */
function isFromDesktop(raw: string | null): boolean {
    if (!raw) return false;
    try {
        return JSON.parse(raw)?.source === 'desktop-sync';
    } catch {
        return false;
    }
}

interface AuditLogClientProps {
    users: { id: string; name: string | null }[];
    branches: { id: string; name: string }[];
}

export default function AuditLogClient({ users, branches }: AuditLogClientProps) {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    // Filters — `searchInput` is what the user types; `search` is the debounced
    // value actually sent to the API (avoids one request per keystroke).
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState('');
    const [selectedEntity, setSelectedEntity] = useState('');
    const [selectedAction, setSelectedAction] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Debounce the search box (400ms) before it triggers a fetch.
    useEffect(() => {
        const t = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: page.toString(), limit: '30' });
            if (search) params.set('search', search);
            if (selectedUser) params.set('userId', selectedUser);
            if (selectedEntity) params.set('entity', selectedEntity);
            if (selectedAction) params.set('action', selectedAction);
            if (selectedBranch) params.set('branchId', selectedBranch);
            if (dateFrom) params.set('from', dateFrom);
            if (dateTo) params.set('to', dateTo);

            const res = await fetch(`/api/audit-log?${params.toString()}`);
            const json = await res.json();
            setLogs(json.logs || []);
            setTotalPages(json.pagination?.totalPages || 1);
            setTotal(json.pagination?.total || 0);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, search, selectedUser, selectedEntity, selectedAction, selectedBranch, dateFrom, dateTo]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const hasActiveFilters = useMemo(
        () => !!(searchInput || selectedUser || selectedEntity || selectedAction || selectedBranch || dateFrom || dateTo),
        [searchInput, selectedUser, selectedEntity, selectedAction, selectedBranch, dateFrom, dateTo],
    );

    const resetFilters = () => {
        setSearchInput('');
        setSearch('');
        setSelectedUser('');
        setSelectedEntity('');
        setSelectedAction('');
        setSelectedBranch('');
        setDateFrom('');
        setDateTo('');
        setPage(1);
    };

    const formatDate = (d: string) =>
        new Date(d).toLocaleString('ar-IQ', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });

    const selectClass = 'border rounded-lg px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40';

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="bg-card rounded-xl shadow-sm border p-4">
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">بحث</label>
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="بحث بالاسم أو التفاصيل..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className={`w-full pr-9 pl-3 py-2 border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40`}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">المستخدم</label>
                        <select value={selectedUser} onChange={(e) => { setSelectedUser(e.target.value); setPage(1); }} className={selectClass}>
                            <option value="">الكل</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.id}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">النوع</label>
                        <select value={selectedEntity} onChange={(e) => { setSelectedEntity(e.target.value); setPage(1); }} className={selectClass}>
                            <option value="">الكل</option>
                            {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">الإجراء</label>
                        <select value={selectedAction} onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }} className={selectClass}>
                            <option value="">الكل</option>
                            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">الفرع</label>
                        <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); setPage(1); }} className={selectClass}>
                            <option value="">الكل</option>
                            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">من</label>
                        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className={selectClass} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">إلى</label>
                        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className={selectClass} />
                    </div>
                </div>
            </div>

            {/* Toolbar: count + actions */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-muted-foreground">
                    إجمالي السجلات: <span className="font-bold text-foreground">{total.toLocaleString('en-US')}</span>
                </div>
                <div className="flex items-center gap-2">
                    {hasActiveFilters && (
                        <button
                            onClick={resetFilters}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border bg-card hover:bg-muted transition-colors"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            مسح الفلاتر
                        </button>
                    )}
                    <button
                        onClick={fetchLogs}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border bg-card hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        تحديث
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-10 text-center text-muted-foreground">
                        <p className="text-sm">لا توجد سجلات مطابقة</p>
                        {hasActiveFilters && (
                            <button onClick={resetFilters} className="mt-3 text-xs text-primary hover:underline">
                                مسح الفلاتر وإظهار الكل
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-muted border-b">
                                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">التاريخ</th>
                                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">المستخدم</th>
                                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">الإجراء</th>
                                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">النوع</th>
                                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">التفاصيل</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log: any) => {
                                    const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-muted text-foreground' };
                                    const details = formatDetails(log.details);
                                    const fromDesktop = isFromDesktop(log.details);
                                    return (
                                        <tr key={log.id} className="border-b border-border/40 hover:bg-muted/50 transition-colors">
                                            <td className="py-3 px-4 text-muted-foreground text-xs whitespace-nowrap">{formatDate(log.createdAt)}</td>
                                            <td className="py-3 px-4 font-medium text-foreground whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5">
                                                    {log.userName}
                                                    {fromDesktop && (
                                                        <span title="من تطبيق سطح المكتب (مزامنة)" className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                            <Laptop className="w-3 h-3" />
                                                            مزامنة
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionInfo.color}`}>
                                                    {actionInfo.label}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{ENTITY_LABELS[log.entity] || log.entity}</td>
                                            <td className="py-3 px-4 text-muted-foreground text-xs max-w-[320px] truncate" title={details}>{details}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-2 rounded-lg border bg-card hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-muted-foreground">
                        صفحة {page} من {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="p-2 rounded-lg border bg-card hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
