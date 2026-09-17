import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ArrowRight, ArrowLeft, BookOpen, Banknote, User, Users, Printer, X, RefreshCw, CheckCircle2, Cloud, CloudOff, Wallet, ReceiptText, TrendingUp, CalendarDays } from 'lucide-react';
import { showAlert } from '../lib/dialog';

interface Debtor {
    id: string;
    name: string;
    phone: string;
    balance: number;
    updatedAt: string;
}

interface SaleItem {
    name: string;
    quantity: number;
    price: number;
    drug?: { tradeName: string };
}

interface Sale {
    id: string;
    total: number;
    createdAt: string;
    items: SaleItem[];
    payment?: { status: string };
}

interface Payment {
    id: string;
    amount: number;
    createdAt: string;
    note?: string;
}

interface DebtorDetails {
    patient: Debtor;
    sales: Sale[];
    payments: Payment[];
}

interface SyncHealth {
    pendingCount: number;
    failedCount: number;
    inProgress: boolean;
}

type LedgerEntry = {
    id: string;
    kind: 'sale' | 'payment';
    date: string;
    amount: number;
    detail: string;
};

export default function DebtsPage() {
    const [view, setView] = useState<'list' | 'detail'>('list');
    const [selectedDebtorId, setSelectedDebtorId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [debtors, setDebtors] = useState<Debtor[]>([]);
    const [loading, setLoading] = useState(false);
    const [details, setDetails] = useState<DebtorDetails | null>(null);

    const searchInputRef = useRef<HTMLInputElement>(null);

    // Repayment Modal State
    const [showRepayModal, setShowRepayModal] = useState(false);
    const [repayAmount, setRepayAmount] = useState<string>('');
    const [repayNote, setRepayNote] = useState('');
    const [submittingRepay, setSubmittingRepay] = useState(false);

    // Sync State
    const [syncHealth, setSyncHealth] = useState<SyncHealth>({ pendingCount: 0, failedCount: 0, inProgress: false });
    const [syncing, setSyncing] = useState(false);
    const [syncToast, setSyncToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    // Refocus search input after repay modal closes (OS blur/focus cycle)
    const prevRepayModal = useRef(false);
    useEffect(() => {
        if (prevRepayModal.current && !showRepayModal) {
            window.ipcRenderer?.send('refocus-window');
            const t = setTimeout(() => searchInputRef.current?.focus(), 200);
            return () => clearTimeout(t);
        }
        prevRepayModal.current = showRepayModal;
    }, [showRepayModal]);

    // Listen to sync health updates
    useEffect(() => {
        if (!window.ipcRenderer) return;
        const handler = (_: any, health: any) => {
            setSyncHealth({
                pendingCount: health.pendingCount ?? 0,
                failedCount: health.failedCount ?? 0,
                inProgress: health.inProgress ?? false,
            });
        };
        window.ipcRenderer.on('sync-health-updated', handler);
        return () => { window.ipcRenderer.off('sync-health-updated', handler); };
    }, []);

    // Auto-dismiss toast
    useEffect(() => {
        if (!syncToast) return;
        const t = setTimeout(() => setSyncToast(null), 3000);
        return () => clearTimeout(t);
    }, [syncToast]);

    const handleSync = async () => {
        if (!window.ipcRenderer || syncing) return;
        setSyncing(true);
        try {
            const res = await window.ipcRenderer.invoke('sync-debts');
            if (res?.success === false) throw new Error(res.error || 'فشلت المزامنة');
            setSyncToast({ type: 'success', msg: 'تمت المزامنة بنجاح' });
            await fetchDebtors();
        } catch (err: any) {
            setSyncToast({ type: 'error', msg: err?.message || 'فشلت المزامنة' });
        } finally {
            setSyncing(false);
        }
    };

    // Sync status config
    const getSyncStatusConfig = () => {
        if (syncing || syncHealth.inProgress) {
            return { label: 'جارٍ المزامنة...', icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />, className: 'bg-info/10 text-info border-info/30' };
        }
        if (syncHealth.failedCount > 0) {
            return { label: `${syncHealth.failedCount} فشل`, icon: <CloudOff className="w-3.5 h-3.5" />, className: 'bg-destructive/10 text-destructive border-destructive/30' };
        }
        if (syncHealth.pendingCount > 0) {
            return { label: `${syncHealth.pendingCount} معلّق`, icon: <Cloud className="w-3.5 h-3.5" />, className: 'bg-warning/10 text-warning border-warning/30' };
        }
        return { label: 'متزامن', icon: <CheckCircle2 className="w-3.5 h-3.5" />, className: 'bg-success/10 text-success border-success/30' };
    };

    const syncStatusConfig = getSyncStatusConfig();

    // Fetch Debtors List
    const fetchDebtors = async () => {
        if (window.ipcRenderer) {
            setLoading(true);
            try {
                const data = await window.ipcRenderer.invoke('get-debtors', { term: searchTerm });
                setDebtors(data);
            } catch (err) {
                console.error("Failed to fetch debtors", err);
            } finally {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        const debounce = setTimeout(fetchDebtors, 300);
        return () => clearTimeout(debounce);
    }, [searchTerm]);

    // Fetch Details
    const fetchDetails = async (id: string) => {
        if (window.ipcRenderer) {
            setLoading(true);
            try {
                const data = await window.ipcRenderer.invoke('get-debtor-details', id);
                if (data.success) {
                    setDetails(data);
                    setView('detail');
                } else {
                    void showAlert({ variant: "error", title: "فشل في جلب التفاصيل", message: data.error });
                }
            } catch (err) {
                console.error(err);
                void showAlert({ variant: "error", title: "خطأ غير متوقع" });
            } finally {
                setLoading(false);
            }
        }
    };

    const handleSelectDebtor = (id: string) => {
        setSelectedDebtorId(id);
        fetchDetails(id);
    };

    const handleRepay = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!window.ipcRenderer || !selectedDebtorId) return;

        const amount = parseFloat(repayAmount);
        if (isNaN(amount) || amount <= 0) {
            void showAlert({ variant: "warning", title: "مبلغ غير صحيح", message: "يرجى إدخال مبلغ صحيح." });
            return;
        }

        setSubmittingRepay(true);
        try {
            const res = await window.ipcRenderer.invoke('add-debt-payment', {
                patientId: selectedDebtorId,
                amount,
                note: repayNote
            });

            if (res.success) {
                void showAlert({ variant: "success", title: "تم تسجيل الدفعة بنجاح", autoCloseMs: 2000 });
                setShowRepayModal(false);
                setRepayAmount('');
                setRepayNote('');
                fetchDetails(selectedDebtorId);
                fetchDebtors();
            } else {
                void showAlert({ variant: "error", title: "فشل التسجيل", message: res.error });
            }
        } catch (err) {
            console.error(err);
            void showAlert({ variant: "error", title: "خطأ في الاتصال" });
        } finally {
            setSubmittingRepay(false);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US').format(val) + ' د.ع';
    };

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString('ar-IQ-u-nu-latn');

    const daysSince = (iso: string) =>
        Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

    // List-level summary stats
    const totalDebt = useMemo(() => debtors.reduce((s, d) => s + d.balance, 0), [debtors]);
    const maxDebt = useMemo(() => debtors.reduce((m, d) => Math.max(m, d.balance), 0), [debtors]);

    // Unified chronological ledger (invoices + payments, newest first)
    const ledger: LedgerEntry[] = useMemo(() => {
        if (!details) return [];
        return [
            ...details.sales.map((s): LedgerEntry => ({
                id: `s-${s.id}`,
                kind: 'sale',
                date: s.createdAt,
                amount: s.total,
                detail: s.items.map(i => `${i.drug?.tradeName || 'غير معروف'} (${i.quantity})`).join('، '),
            })),
            ...details.payments.map((p): LedgerEntry => ({
                id: `p-${p.id}`,
                kind: 'payment',
                date: p.createdAt,
                amount: p.amount,
                detail: p.note || 'تسديد نقدي',
            })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [details]);

    const totalPaid = useMemo(
        () => (details ? details.payments.reduce((s, p) => s + p.amount, 0) : 0),
        [details],
    );

    if (view === 'detail' && details) {
        return (
            <div className="p-6 h-full flex flex-col bg-background overflow-hidden" dir="rtl">
                {/* Header */}
                <div className="flex items-center gap-4 mb-5 shrink-0">
                    <button
                        onClick={() => setView('list')}
                        title="عودة إلى القائمة"
                        className="p-2.5 bg-card rounded-xl hover:bg-muted transition-colors border border-border"
                    >
                        <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-foreground leading-tight">{details.patient.name}</h2>
                        <p className="text-muted-foreground text-sm tabular-nums" dir="ltr">{details.patient.phone}</p>
                    </div>
                    <div className="mr-auto flex gap-2">
                        <button
                            onClick={() => window.print()}
                            className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border text-foreground rounded-xl hover:bg-muted text-sm font-bold transition-colors"
                        >
                            <Printer className="w-4 h-4" />
                            طباعة كشف
                        </button>
                        <button
                            onClick={() => setShowRepayModal(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold transition-colors"
                        >
                            <Banknote className="w-4 h-4" />
                            تسديد دفعة
                        </button>
                    </div>
                </div>

                {/* Account summary — flat stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 shrink-0">
                    <div className="bg-card border border-border rounded-xl p-4 border-r-4 border-r-destructive">
                        <div className="flex items-center gap-2 text-destructive mb-1.5">
                            <Wallet className="w-4 h-4" />
                            <span className="text-xs font-bold">الرصيد المستحق</span>
                        </div>
                        <p className="text-2xl font-black text-destructive tabular-nums">{formatCurrency(details.patient.balance)}</p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                            <ReceiptText className="w-4 h-4" />
                            <span className="text-xs font-bold">فواتير آجلة</span>
                        </div>
                        <p className="text-2xl font-black text-foreground tabular-nums">{details.sales.length}</p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4">
                        <div className="flex items-center gap-2 text-success mb-1.5">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-xs font-bold">إجمالي المسدد</span>
                        </div>
                        <p className="text-2xl font-black text-success tabular-nums">{formatCurrency(totalPaid)}</p>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                            <CalendarDays className="w-4 h-4" />
                            <span className="text-xs font-bold">آخر حركة</span>
                        </div>
                        <p className="text-lg font-black text-foreground tabular-nums" dir="ltr">{formatDate(details.patient.updatedAt)}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">منذ {daysSince(details.patient.updatedAt)} يوم</p>
                    </div>
                </div>

                {/* Unified Ledger */}
                <div className="flex-1 bg-card rounded-xl border border-border overflow-hidden flex flex-col min-h-0">
                    <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                        <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-muted-foreground" />
                            سجل العمليات
                        </h3>
                        <span className="text-xs text-muted-foreground tabular-nums">{ledger.length} حركة</span>
                    </div>

                    <div className="overflow-y-auto flex-1">
                        <table className="w-full text-right">
                            <thead className="bg-muted/60 text-muted-foreground text-xs font-bold sticky top-0 backdrop-blur-sm">
                                <tr>
                                    <th className="px-5 py-3">النوع</th>
                                    <th className="px-5 py-3">المبلغ</th>
                                    <th className="px-5 py-3">التاريخ</th>
                                    <th className="px-5 py-3">التفاصيل</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {ledger.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-10 text-center text-muted-foreground text-sm">لا توجد حركات</td>
                                    </tr>
                                )}
                                {ledger.map(entry => (
                                    <tr key={entry.id} className="hover:bg-muted/40 transition-colors">
                                        <td className="px-5 py-3.5">
                                            {entry.kind === 'sale' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 text-destructive text-xs font-bold">
                                                    <ReceiptText className="w-3.5 h-3.5" />
                                                    فاتورة آجل
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-success/10 text-success text-xs font-bold">
                                                    <Banknote className="w-3.5 h-3.5" />
                                                    تسديد
                                                </span>
                                            )}
                                        </td>
                                        <td className={`px-5 py-3.5 font-bold tabular-nums ${entry.kind === 'sale' ? 'text-foreground' : 'text-success'}`}>
                                            {entry.kind === 'sale' ? '+' : '−'} {formatCurrency(entry.amount)}
                                        </td>
                                        <td className="px-5 py-3.5 text-sm text-muted-foreground tabular-nums" dir="ltr">
                                            {formatDate(entry.date)}
                                        </td>
                                        <td className="px-5 py-3.5 text-sm text-muted-foreground truncate max-w-xs">
                                            {entry.detail}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Repay Modal */}
                {showRepayModal && (
                    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center px-5 py-4 border-b border-border">
                                <h3 className="font-bold text-foreground flex items-center gap-2">
                                    <Banknote className="w-5 h-5 text-primary" />
                                    تسديد دفعة جديدة
                                </h3>
                                <button onClick={() => setShowRepayModal(false)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <form onSubmit={handleRepay} className="p-5 space-y-4">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-bold text-foreground">المبلغ الواصل (د.ع)</label>
                                        <button
                                            type="button"
                                            onClick={() => setRepayAmount(String(details.patient.balance))}
                                            className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition-colors"
                                        >
                                            سداد كامل ({formatCurrency(details.patient.balance)})
                                        </button>
                                    </div>
                                    <input
                                        type="number" autoFocus required min={1}
                                        className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none text-2xl font-black text-center text-foreground tabular-nums"
                                        placeholder="0"
                                        value={repayAmount}
                                        onChange={e => setRepayAmount(e.target.value)}
                                    />
                                    {repayAmount && parseFloat(repayAmount) > 0 && (
                                        <p className="text-xs text-muted-foreground mt-2 text-center tabular-nums">
                                            المتبقي بعد التسديد: <span className="font-bold text-foreground">{formatCurrency(Math.max(0, details.patient.balance - parseFloat(repayAmount)))}</span>
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-foreground mb-2">ملاحظات</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none text-sm text-foreground"
                                        placeholder="مثال: تسديد جزء من الحساب"
                                        value={repayNote}
                                        onChange={e => setRepayNote(e.target.value)}
                                    />
                                </div>
                                <button
                                    disabled={submittingRepay}
                                    type="submit"
                                    className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {submittingRepay ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            جاري الحفظ...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4" />
                                            تأكيد التسديد
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // LIST VIEW
    return (
        <div className="p-6 h-full flex flex-col bg-background" dir="rtl">

            {/* Sync Toast */}
            {syncToast && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-bold border transition-all ${
                    syncToast.type === 'success'
                        ? 'bg-success/10 text-success border-success/30'
                        : 'bg-destructive/10 text-destructive border-destructive/30'
                }`}>
                    {syncToast.type === 'success'
                        ? <CheckCircle2 className="w-4 h-4" />
                        : <CloudOff className="w-4 h-4" />
                    }
                    {syncToast.msg}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-foreground leading-tight">دفتر الديون</h1>
                        <p className="text-muted-foreground text-sm">إدارة الديون والأرصدة — يعمل بدون إنترنت</p>
                    </div>
                </div>

                {/* Sync Controls */}
                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${syncStatusConfig.className}`}>
                        {syncStatusConfig.icon}
                        <span>{syncStatusConfig.label}</span>
                    </div>
                    <button
                        onClick={handleSync}
                        disabled={syncing || syncHealth.inProgress}
                        title="إعادة المزامنة"
                        className="flex items-center gap-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-sm font-bold transition-colors border border-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RefreshCw className={`w-4 h-4 ${syncing || syncHealth.inProgress ? 'animate-spin' : ''}`} />
                        مزامنة
                    </button>
                </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-card border border-border rounded-xl p-4 border-r-4 border-r-destructive">
                    <div className="flex items-center gap-2 text-destructive mb-1.5">
                        <Wallet className="w-4 h-4" />
                        <span className="text-xs font-bold">إجمالي الديون المستحقة</span>
                    </div>
                    <p className="text-2xl font-black text-destructive tabular-nums">{formatCurrency(totalDebt)}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                        <Users className="w-4 h-4" />
                        <span className="text-xs font-bold">عدد المدينين</span>
                    </div>
                    <p className="text-2xl font-black text-foreground tabular-nums">{debtors.length}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 text-warning mb-1.5">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-xs font-bold">أعلى دين</span>
                    </div>
                    <p className="text-2xl font-black text-foreground tabular-nums">{formatCurrency(maxDebt)}</p>
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-4">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input
                    ref={searchInputRef}
                    type="text"
                    className="w-full pr-12 pl-4 py-3 rounded-xl border border-border bg-card focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all text-foreground placeholder:text-muted-foreground"
                    placeholder="بحث عن عميل بالاسم أو رقم الهاتف..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Debtors table */}
            <div className="bg-card rounded-xl border border-border overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-right">
                        <thead className="bg-muted/60 text-muted-foreground text-xs font-bold sticky top-0 z-10 backdrop-blur-sm">
                            <tr>
                                <th className="px-5 py-3">العميل</th>
                                <th className="px-5 py-3">رقم الهاتف</th>
                                <th className="px-5 py-3">إجمالي الدين</th>
                                <th className="px-5 py-3">آخر حركة</th>
                                <th className="px-5 py-3 text-center">فتح</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-muted" />
                                                <div className="h-3.5 w-32 bg-muted rounded" />
                                            </div>
                                        </td>
                                        <td className="px-5 py-4"><div className="h-3.5 w-24 bg-muted rounded" /></td>
                                        <td className="px-5 py-4"><div className="h-6 w-28 bg-muted rounded-lg" /></td>
                                        <td className="px-5 py-4"><div className="h-3.5 w-20 bg-muted rounded" /></td>
                                        <td className="px-5 py-4"><div className="h-8 w-8 bg-muted rounded-lg mx-auto" /></td>
                                    </tr>
                                ))
                            ) : debtors.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-14 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center">
                                                <BookOpen className="w-6 h-6 opacity-30" />
                                            </div>
                                            <p className="font-bold text-foreground">
                                                {searchTerm ? 'لا توجد نتائج مطابقة للبحث' : 'لا يوجد عملاء مدينون حالياً'}
                                            </p>
                                            <p className="text-xs">
                                                {searchTerm ? 'جرّب اسماً أو رقماً آخر' : 'فواتير البيع بالآجل تظهر هنا تلقائياً'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                debtors.map(debtor => {
                                    const stale = daysSince(debtor.updatedAt) > 30;
                                    return (
                                        <tr key={debtor.id} className="hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => handleSelectDebtor(debtor.id)}>
                                            <td className="px-5 py-3.5 font-bold text-foreground">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                                                        {debtor.name.charAt(0)}
                                                    </div>
                                                    {debtor.name}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 text-muted-foreground text-sm tabular-nums" dir="ltr">{debtor.phone}</td>
                                            <td className="px-5 py-3.5">
                                                <span className="inline-block px-3 py-1 rounded-lg bg-destructive/10 text-destructive font-bold text-sm tabular-nums">
                                                    {formatCurrency(debtor.balance)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-muted-foreground tabular-nums">{formatDate(debtor.updatedAt)}</span>
                                                    {stale && (
                                                        <span className="px-2 py-0.5 rounded-md bg-warning/10 text-warning text-[10px] font-bold">
                                                            +٣٠ يوم
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 text-center">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleSelectDebtor(debtor.id); }}
                                                    title="فتح كشف الحساب"
                                                    className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                                >
                                                    <ArrowLeft className="w-5 h-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
