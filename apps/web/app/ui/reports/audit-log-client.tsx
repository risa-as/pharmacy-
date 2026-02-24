'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    CREATE: { label: 'إنشاء', color: 'bg-success/10 text-success' },
    UPDATE: { label: 'تعديل', color: 'bg-primary/10 text-primary' },
    DELETE: { label: 'حذف', color: 'bg-destructive/10 text-destructive' },
    RETURN: { label: 'مرتجع', color: 'bg-warning/10 text-warning' },
    LOGIN: { label: 'تسجيل دخول', color: 'bg-info/10 text-info' },
    PRICE_CHANGE: { label: 'تغيير سعر', color: 'bg-warning/10 text-warning' },
    TRANSFER: { label: 'تحويل', color: 'bg-info/10 text-info' },
};

const ENTITY_LABELS: Record<string, string> = {
    SALE: 'مبيعات',
    INVENTORY: 'مخزون',
    DRUG: 'دواء',
    USER: 'مستخدم',
    EXPENSE: 'مصروف',
    TRANSFER: 'تحويل',
    PATIENT: 'مريض',
    SUPPLIER: 'مورد',
    SHIFT: 'وردية',
};

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

    // Filters
    const [search, setSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState('');
    const [selectedEntity, setSelectedEntity] = useState('');
    const [selectedAction, setSelectedAction] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

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

    const formatDate = (d: string) => {
        return new Date(d).toLocaleString('ar-IQ', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    };

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
                                placeholder="بحث في السجلات..."
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                className="w-full pr-9 pl-3 py-2 border rounded-lg text-sm bg-muted"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">المستخدم</label>
                        <select value={selectedUser} onChange={(e) => { setSelectedUser(e.target.value); setPage(1); }}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted">
                            <option value="">الكل</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.id}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">النوع</label>
                        <select value={selectedEntity} onChange={(e) => { setSelectedEntity(e.target.value); setPage(1); }}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted">
                            <option value="">الكل</option>
                            {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">الإجراء</label>
                        <select value={selectedAction} onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted">
                            <option value="">الكل</option>
                            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">الفرع</label>
                        <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); setPage(1); }}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted">
                            <option value="">الكل</option>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">من</label>
                        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">إلى</label>
                        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted" />
                    </div>
                </div>
            </div>

            {/* Results Count */}
            <div className="text-sm text-muted-foreground">
                إجمالي السجلات: <span className="font-bold text-foreground">{total}</span>
            </div>

            {/* Table */}
            <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">لا توجد سجلات</div>
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
                                    return (
                                        <tr key={log.id} className="border-b border-border/40 hover:bg-muted/50">
                                            <td className="py-3 px-4 text-muted-foreground text-xs whitespace-nowrap">{formatDate(log.createdAt)}</td>
                                            <td className="py-3 px-4 font-medium text-foreground">{log.userName}</td>
                                            <td className="py-3 px-4">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionInfo.color}`}>
                                                    {actionInfo.label}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground">{ENTITY_LABELS[log.entity] || log.entity}</td>
                                            <td className="py-3 px-4 text-muted-foreground text-xs max-w-[300px] truncate">{log.details}</td>
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
                        className="p-2 rounded-lg border bg-card hover:bg-muted disabled:opacity-40"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-muted-foreground">
                        صفحة {page} من {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="p-2 rounded-lg border bg-card hover:bg-muted disabled:opacity-40"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
