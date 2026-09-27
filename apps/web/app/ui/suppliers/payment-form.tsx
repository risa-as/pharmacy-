'use client';

import { useState, useEffect, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CreditCard, X, Loader2 } from 'lucide-react';
import { getSupplierPaymentStatus, recordSupplierPayment } from '@/app/lib/actions/supplier-ledger-actions';
import { clearPendingPayment, loadPendingPayment, savePendingPayment } from './pending-payment';

/** localStorage, or undefined where it is unavailable (it can throw). */
const browserStorage = () => { try { return window.localStorage; } catch { return undefined; } };

type Branch = { id: string; name: string };
type Safe = { id: string; name: string; branchId: string; balance: number };

export function PaymentFormWrapper({ supplierId, supplierName, branches, safes }: { supplierId: string; supplierName: string; branches: Branch[]; safes: Safe[] }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-bold text-success-foreground transition-all hover:bg-success/90 shadow-sm"
            >
                <CreditCard className="h-4 w-4" />
                تسجيل دفعة
            </button>
            {isOpen && (
                <PaymentModal
                    supplierId={supplierId}
                    supplierName={supplierName}
                    branches={branches}
                    safes={safes}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </>
    );
}

function PaymentModal({
    supplierId,
    supplierName,
    branches,
    safes,
    onClose,
}: {
    supplierId: string;
    supplierName: string;
    branches: Branch[];
    safes: Safe[];
    onClose: () => void;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState('');
    const [mounted, setMounted] = useState(false);
    // One id per payment: resent unchanged if the user retries, so it is never paid twice.
    // An attempt whose answer was lost is kept (pending-payment.ts) and resumed here.
    const [requestId, setRequestId] = useState(() => crypto.randomUUID());
    const [notice, setNotice] = useState('');
    const [checking, setChecking] = useState(false);
    const firstSafe = (branchId: string) => safes.find(s => s.branchId === branchId)?.id || '';
    const [form, setForm] = useState({
        amount: '',
        method: 'CASH',
        branchId: branches[0]?.id || '',
        safeId: firstSafe(branches[0]?.id || ''),
        reference: '',
        notes: '',
        date: new Date().toISOString().split('T')[0],
    });

    useEffect(() => { setMounted(true); }, []);

    // Resume an unsettled attempt for this supplier: same id, same values, and ask
    // the server whether it was recorded before offering to send it again.
    useEffect(() => {
        const pending = loadPendingPayment(browserStorage(), supplierId);
        if (!pending) return;
        setRequestId(pending.requestId);
        setForm(pending.values);
        setChecking(true);
        getSupplierPaymentStatus(pending.requestId)
            .then((status) => {
                if (status.recorded) {
                    clearPendingPayment(browserStorage(), supplierId);
                    setRequestId(crypto.randomUUID());
                    setForm((f) => ({ ...f, amount: '', reference: '', notes: '' }));
                    setNotice('الدفعة السابقة سُجّلت بنجاح ولن تُسجَّل مرة أخرى. هذا النموذج لدفعة جديدة.');
                    router.refresh();
                } else {
                    setNotice('محاولة سابقة لهذه الدفعة لم تُعرف نتيجتها ولم تُسجَّل. أعد الإرسال بالبيانات نفسها؛ لن تُسجَّل مرتين.');
                }
            })
            .catch(() => setNotice('تعذّر التحقق من المحاولة السابقة. أعد الإرسال بالبيانات نفسها؛ لن تُسجَّل مرتين.'))
            .finally(() => setChecking(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supplierId]);

    if (!mounted) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const amount = parseFloat(form.amount);
        if (isNaN(amount) || amount <= 0) {
            setError('المبلغ يجب أن يكون أكبر من صفر');
            return;
        }

        if (form.method === 'CASH' && !form.safeId) {
            setError('اختر الصندوق الذي يُدفع منه النقد');
            return;
        }

        // Recorded before sending: if the answer is lost, reopening resumes this attempt.
        savePendingPayment(browserStorage(), supplierId, { requestId, values: form });
        startTransition(async () => {
            let result: Awaited<ReturnType<typeof recordSupplierPayment>>;
            try {
                result = await recordSupplierPayment({
                supplierId,
                branchId: form.branchId,
                amount,
                method: form.method,
                safeId: form.method === 'CASH' ? form.safeId : null,
                requestId,
                reference: form.reference || undefined,
                notes: form.notes || undefined,
                date: form.date,
            });
            } catch {
                setError('تعذّر التأكد من نتيجة الدفعة. أعد الإرسال بالبيانات نفسها؛ لن تُسجَّل مرتين.');
                return;
            }

            if (result.success) {
                clearPendingPayment(browserStorage(), supplierId);
                onClose();
                router.refresh();
            } else if ('code' in result && result.code === 'REQUEST_CONFLICT') {
                // This attempt was already recorded with other values: never pay again blindly.
                clearPendingPayment(browserStorage(), supplierId);
                setRequestId(crypto.randomUUID());
                setError(result.error || 'فشل في تسجيل الدفعة');
                router.refresh();
            } else {
                // Refused: nothing was recorded, so the attempt is settled.
                clearPendingPayment(browserStorage(), supplierId);
                setError(result.error || 'فشل في تسجيل الدفعة');
            }
        });
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-card rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
                dir="rtl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h3 className="text-lg font-bold font-cairo text-foreground">
                        تسجيل دفعة — {supplierName}
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-bold font-cairo text-foreground mb-1">
                            المبلغ (د.ع) *
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            required
                            value={form.amount}
                            onChange={(e) => setForm({ ...form, amount: e.target.value })}
                            className="w-full rounded-lg border border-border px-4 py-2.5 text-lg font-bold text-foreground focus:ring-2 focus:ring-success/50 focus:border-success"
                            placeholder="0.00"
                            dir="ltr"
                            autoFocus
                        />
                    </div>

                    {/* Branch */}
                    {branches.length > 1 && (
                        <div>
                            <label className="block text-sm font-bold font-cairo text-foreground mb-1">
                                الفرع
                            </label>
                            <select
                                value={form.branchId}
                                onChange={(e) => setForm({ ...form, branchId: e.target.value, safeId: firstSafe(e.target.value) })}
                                className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground focus:ring-2 focus:ring-success/50"
                            >
                                {branches.map((b: any) => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Method */}
                    <div>
                        <label className="block text-sm font-bold font-cairo text-foreground mb-1">
                            طريقة الدفع
                        </label>
                        <select
                            value={form.method}
                            onChange={(e) => setForm({ ...form, method: e.target.value })}
                            className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground focus:ring-2 focus:ring-success/50"
                        >
                            <option value="CASH">نقدي</option>
                            <option value="CHECK">شيك</option>
                            <option value="TRANSFER">حوالة / تحويل</option>
                        </select>
                    </div>

                    {/* Drawer: only cash leaves a safe */}
                    {form.method === 'CASH' ? (
                        <div>
                            <label className="block text-sm font-bold font-cairo text-foreground mb-1">
                                الصندوق الذي يُدفع منه *
                            </label>
                            {safes.some(s => s.branchId === form.branchId) ? (
                                <select
                                    value={form.safeId}
                                    onChange={(e) => setForm({ ...form, safeId: e.target.value })}
                                    className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground focus:ring-2 focus:ring-success/50"
                                >
                                    {safes.filter(s => s.branchId === form.branchId).map(s => (
                                        <option key={s.id} value={s.id}>{s.name} — الرصيد {s.balance.toLocaleString('ar-IQ')} د.ع</option>
                                    ))}
                                </select>
                            ) : (
                                <p className="text-sm text-destructive">لا يوجد صندوق في هذا الفرع؛ اختر شيكاً أو حوالة.</p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">سيُخصم المبلغ من هذا الصندوق ويُسجَّل كحركة صرف.</p>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">الشيك والحوالة لا يُخصمان من أي صندوق.</p>
                    )}

                    {/* Reference */}
                    {form.method !== 'CASH' && (
                        <div>
                            <label className="block text-sm font-bold font-cairo text-foreground mb-1">
                                {form.method === 'CHECK' ? 'رقم الشيك' : 'رقم الحوالة'}
                            </label>
                            <input
                                type="text"
                                value={form.reference}
                                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                                className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground focus:ring-2 focus:ring-success/50"
                                placeholder={form.method === 'CHECK' ? 'أدخل رقم الشيك' : 'أدخل رقم الحوالة'}
                            />
                        </div>
                    )}

                    {/* Date */}
                    <div>
                        <label className="block text-sm font-bold font-cairo text-foreground mb-1">
                            التاريخ
                        </label>
                        <input
                            type="date"
                            value={form.date}
                            onChange={(e) => setForm({ ...form, date: e.target.value })}
                            className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground focus:ring-2 focus:ring-success/50"
                            dir="ltr"
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-bold font-cairo text-foreground mb-1">
                            ملاحظات
                        </label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground focus:ring-2 focus:ring-success/50"
                            rows={2}
                            placeholder="ملاحظات اختيارية"
                        />
                    </div>

                    {notice && (
                        <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg text-sm text-foreground">
                            {notice}
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={isPending || checking}
                        className="w-full flex items-center justify-center gap-2 bg-success hover:bg-success/90 text-success-foreground font-bold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                جاري التسجيل...
                            </>
                        ) : (
                            <>
                                <CreditCard className="w-4 h-4" />
                                تأكيد الدفعة
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    , document.body);
}
