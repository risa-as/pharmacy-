import { useState, useEffect } from 'react';
import { Search, ArrowRight, BookOpen, Banknote, User, CheckCircle, AlertCircle, Printer, X } from 'lucide-react';

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

export default function DebtsPage() {
    const [view, setView] = useState<'list' | 'detail'>('list');
    const [selectedDebtorId, setSelectedDebtorId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [debtors, setDebtors] = useState<Debtor[]>([]);
    const [loading, setLoading] = useState(false);
    const [details, setDetails] = useState<DebtorDetails | null>(null);

    // Repayment Modal State
    const [showRepayModal, setShowRepayModal] = useState(false);
    const [repayAmount, setRepayAmount] = useState<string>('');
    const [repayNote, setRepayNote] = useState('');
    const [submittingRepay, setSubmittingRepay] = useState(false);

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
                    alert("فشل في جلب التفاصيل: " + data.error);
                }
            } catch (err) {
                console.error(err);
                alert("خطأ غير متوقع");
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
            alert("يرجى إدخال مبلغ صحيح");
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
                alert("تم تسجيل الدفعة بنجاح");
                setShowRepayModal(false);
                setRepayAmount('');
                setRepayNote('');
                fetchDetails(selectedDebtorId);
                fetchDebtors();
            } else {
                alert("فشل التسجيل: " + res.error);
            }
        } catch (err) {
            console.error(err);
            alert("خطأ في الاتصال");
        } finally {
            setSubmittingRepay(false);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('ar-IQ').format(val) + ' د.ع';
    };

    if (view === 'detail' && details) {
        return (
            <div className="p-6 h-full flex flex-col bg-background overflow-hidden" dir="rtl">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6 shrink-0">
                    <button
                        onClick={() => setView('list')}
                        className="p-2 bg-card rounded-xl shadow-sm hover:bg-muted transition-colors border border-border"
                    >
                        <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2 text-foreground">
                            <User className="w-6 h-6 text-primary" />
                            {details.patient.name}
                        </h2>
                        <p className="text-muted-foreground text-sm" dir="ltr">{details.patient.phone}</p>
                    </div>
                    <div className="mr-auto flex gap-3">
                        <button
                            onClick={() => window.print()}
                            className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground rounded-xl hover:bg-muted shadow-sm transition-all"
                        >
                            <Printer className="w-5 h-5" />
                            طباعة كشف
                        </button>
                    </div>
                </div>

                {/* Dashboard Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 shrink-0">
                    <div className="bg-gradient-to-br from-red-500 to-rose-600 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Banknote className="w-24 h-24" />
                        </div>
                        <p className="text-sm font-medium opacity-90 mb-1">الرصيد الحالي المستحق</p>
                        <h3 className="text-4xl font-bold tracking-tight">{formatCurrency(details.patient.balance)}</h3>
                        <button
                            onClick={() => setShowRepayModal(true)}
                            className="mt-6 w-full py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl font-bold transition-all border border-white/30 flex items-center justify-center gap-2"
                        >
                            <CheckCircle className="w-5 h-5" />
                            تسديد دفعة
                        </button>
                    </div>

                    <div className="bg-card p-6 rounded-2xl shadow-sm border border-border flex flex-col justify-center">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-primary/10 rounded-xl text-primary">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">حالة الحساب</p>
                                <p className="font-bold text-foreground">نشط</p>
                            </div>
                        </div>
                        <div className="h-px bg-border my-2" />
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">آخر تحديث:</span>
                            <span className="font-medium text-foreground" dir="ltr">
                                {new Date(details.patient.updatedAt).toLocaleDateString('ar-IQ')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Ledger Table */}
                <div className="flex-1 bg-card rounded-2xl shadow-sm border border-border overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-border bg-muted/50">
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-muted-foreground" />
                            سجل العمليات (فواتير ودفعات)
                        </h3>
                    </div>

                    <div className="overflow-y-auto flex-1 p-0">
                        <table className="w-full text-right">
                            <thead className="bg-muted text-muted-foreground text-xs font-semibold sticky top-0">
                                <tr>
                                    <th className="p-4">النوع</th>
                                    <th className="p-4">المبلغ</th>
                                    <th className="p-4">التاريخ</th>
                                    <th className="p-4">تفاصيل</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {details.sales.length === 0 && details.payments.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-muted-foreground">لا توجد حركات</td>
                                    </tr>
                                )}

                                {/* Pending Sales */}
                                {details.sales.map(sale => (
                                    <tr key={sale.id} className="hover:bg-destructive/5 transition-colors">
                                        <td className="p-4">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-destructive/10 text-destructive text-xs font-bold">
                                                فاتورة آجل
                                            </span>
                                        </td>
                                        <td className="p-4 font-bold text-foreground">
                                            {formatCurrency(sale.total)}
                                        </td>
                                        <td className="p-4 text-sm text-muted-foreground" dir="ltr">
                                            {new Date(sale.createdAt).toLocaleDateString('ar-IQ')}
                                        </td>
                                        <td className="p-4 text-sm text-muted-foreground truncate max-w-xs">
                                            {sale.items.map(i => `${i.drug?.tradeName || 'Unknown'} (${i.quantity})`).join(', ')}
                                        </td>
                                    </tr>
                                ))}

                                {/* Payments */}
                                {details.payments.map(pay => (
                                    <tr key={pay.id} className="hover:bg-success/5 transition-colors bg-success/5">
                                        <td className="p-4">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-success/10 text-success text-xs font-bold">
                                                تسديد نقدي
                                            </span>
                                        </td>
                                        <td className="p-4 font-bold text-success">
                                            - {formatCurrency(pay.amount)}
                                        </td>
                                        <td className="p-4 text-sm text-muted-foreground" dir="ltr">
                                            {new Date(pay.createdAt).toLocaleDateString('ar-IQ')}
                                        </td>
                                        <td className="p-4 text-sm text-muted-foreground">
                                            {pay.note || "تسديد"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Repay Modal */}
                {showRepayModal && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border">
                            <div className="flex justify-between items-center p-5 border-b border-border">
                                <h3 className="font-bold text-lg text-foreground">تسديد دفعة جديدة</h3>
                                <button onClick={() => setShowRepayModal(false)} className="p-2 hover:bg-muted rounded-full text-muted-foreground">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <form onSubmit={handleRepay} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">المبلغ واصل (د.ع)</label>
                                    <input
                                        type="number" autoFocus required min={1}
                                        className="w-full px-4 py-3 rounded-xl border border-border bg-muted focus:ring-2 focus:ring-primary outline-none text-xl font-bold text-center text-foreground"
                                        placeholder="0"
                                        value={repayAmount}
                                        onChange={e => setRepayAmount(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground mt-2 text-center">المبلغ المتبقي: {formatCurrency(details.patient.balance)}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">ملاحظات</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 rounded-xl border border-border bg-muted focus:ring-2 focus:ring-primary outline-none text-foreground"
                                        placeholder="مثال: تسديد جزء من الحساب"
                                        value={repayNote}
                                        onChange={e => setRepayNote(e.target.value)}
                                    />
                                </div>
                                <button
                                    disabled={submittingRepay}
                                    type="submit"
                                    className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all shadow-lg disabled:opacity-50"
                                >
                                    {submittingRepay ? "جاري الحفظ..." : "تأكيد التسديد"}
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
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-black text-foreground flex items-center gap-3">
                        <BookOpen className="w-8 h-8 text-primary" />
                        دفتر الديون
                    </h1>
                    <p className="text-muted-foreground mt-1">إدارة الديون والأرصدة (يعمل بدون إنترنت)</p>
                </div>
            </div>

            <div className="flex gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute right-4 top-3.5 w-5 h-5 text-muted-foreground" />
                    <input
                        type="text"
                        className="w-full pr-12 pl-4 py-3 rounded-xl border border-border bg-card focus:ring-2 focus:ring-primary outline-none shadow-sm transition-all text-foreground placeholder:text-muted-foreground"
                        placeholder="بحث عن عميل باسم أو رقم هاتف..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden flex-1 flex flex-col">
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-right">
                        <thead className="bg-muted text-muted-foreground text-xs font-semibold sticky top-0 shadow-sm z-10">
                            <tr>
                                <th className="p-4">العميل</th>
                                <th className="p-4">رقم الهاتف</th>
                                <th className="p-4">إجمالي الدين</th>
                                <th className="p-4">آخر حركة</th>
                                <th className="p-4 text-center">إجراء</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-muted-foreground">جاري التحميل...</td>
                                </tr>
                            ) : debtors.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="p-4 bg-muted rounded-full">
                                                <BookOpen className="w-8 h-8 opacity-20" />
                                            </div>
                                            <p>لا يوجد عملاء مدينين حالياً</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                debtors.map(debtor => (
                                    <tr key={debtor.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => handleSelectDebtor(debtor.id)}>
                                        <td className="p-4 font-bold text-foreground">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                    {debtor.name.charAt(0)}
                                                </div>
                                                {debtor.name}
                                            </div>
                                        </td>
                                        <td className="p-4 text-muted-foreground text-sm" dir="ltr">{debtor.phone}</td>
                                        <td className="p-4">
                                            <span className="inline-block px-3 py-1 rounded-lg bg-destructive/10 text-destructive font-bold text-sm">
                                                {formatCurrency(debtor.balance)}
                                            </span>
                                        </td>
                                        <td className="p-4 text-muted-foreground text-sm">
                                            {new Date(debtor.updatedAt).toLocaleDateString('ar-IQ')}
                                        </td>
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleSelectDebtor(debtor.id); }}
                                                className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                            >
                                                <ArrowRight className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
