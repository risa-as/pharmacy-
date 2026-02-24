'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, X, Loader2 } from 'lucide-react';
import { recordSupplierPayment } from '@/app/lib/actions/supplier-ledger-actions';

type Branch = { id: string; name: string };

export function PaymentFormWrapper({ supplierId, supplierName, branches }: { supplierId: string; supplierName: string; branches: Branch[] }) {
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
    onClose,
}: {
    supplierId: string;
    supplierName: string;
    branches: Branch[];
    onClose: () => void;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState('');

    const [form, setForm] = useState({
        amount: '',
        method: 'CASH',
        branchId: branches[0]?.id || '',
        reference: '',
        notes: '',
        date: new Date().toISOString().split('T')[0],
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const amount = parseFloat(form.amount);
        if (isNaN(amount) || amount <= 0) {
            setError('المبلغ يجب أن يكون أكبر من صفر');
            return;
        }

        startTransition(async () => {
            const result = await recordSupplierPayment({
                supplierId,
                branchId: form.branchId,
                amount,
                method: form.method,
                reference: form.reference || undefined,
                notes: form.notes || undefined,
                date: form.date,
            });

            if (result.success) {
                onClose();
                router.refresh();
            } else {
                setError(result.error || 'فشل في تسجيل الدفعة');
            }
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-card rounded-2xl w-full max-w-md shadow-2xl"
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
                                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                                className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground focus:ring-2 focus:ring-success/50"
                            >
                                {branches.map(b => (
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

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={isPending}
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
    );
}
