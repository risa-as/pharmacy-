'use client';

import { useState, useEffect, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Landmark, X, Loader2 } from 'lucide-react';
import { setSupplierOpeningBalance } from '@/app/lib/actions/supplier-ledger-actions';

type Branch = { id: string; name: string };

export function OpeningBalanceButton({
    supplierId,
    supplierName,
    branches,
}: {
    supplierId: string;
    supplierName: string;
    branches: Branch[];
}) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-all hover:bg-muted shadow-sm"
            >
                <Landmark className="h-4 w-4 text-warning" />
                رصيد افتتاحي
            </button>
            {isOpen && (
                <OpeningBalanceModal
                    supplierId={supplierId}
                    supplierName={supplierName}
                    branches={branches}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </>
    );
}

function OpeningBalanceModal({
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
    const [mounted, setMounted] = useState(false);
    const [error, setError] = useState('');
    const [amount, setAmount] = useState('');
    const [branchId, setBranchId] = useState(branches[0]?.id || '');
    const [notes, setNotes] = useState('رصيد مرحّل من قبل النظام');

    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = parseFloat(amount);
        if (isNaN(parsed) || parsed <= 0) {
            setError('يجب إدخال مبلغ أكبر من صفر');
            return;
        }
        setError('');
        startTransition(async () => {
            const result = await setSupplierOpeningBalance({
                supplierId,
                branchId,
                amount: parsed,
                notes: notes || undefined,
            });
            if (result.success) {
                onClose();
                router.refresh();
            } else {
                setError(result.error || 'فشل في تسجيل الرصيد');
            }
        });
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-card rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
                dir="rtl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div>
                        <h3 className="text-lg font-bold font-cairo text-foreground flex items-center gap-2">
                            <Landmark className="w-5 h-5 text-warning" />
                            رصيد افتتاحي
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">المورد: <span className="font-bold">{supplierName}</span></p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Info */}
                <div className="mx-6 mt-4 rounded-xl bg-warning/10 border border-warning/20 px-4 py-3 text-sm text-warning">
                    أدخل المبلغ المستحق للمورد قبل بدء استخدام النظام. يُستخدم هذا لمرة واحدة فقط عند الإعداد الأولي.
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">المبلغ المستحق (د.ع) *</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            autoFocus
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder="0.00"
                            dir="ltr"
                            className="w-full rounded-lg border border-border px-4 py-2.5 text-xl font-bold text-foreground focus:ring-2 focus:ring-warning/40 focus:border-warning"
                        />
                    </div>

                    {/* Branch */}
                    {branches.length > 1 && (
                        <div>
                            <label className="block text-sm font-bold text-foreground mb-1">الفرع</label>
                            <select
                                value={branchId}
                                onChange={e => setBranchId(e.target.value)}
                                className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground focus:ring-2 focus:ring-warning/40"
                            >
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">ملاحظة</label>
                        <input
                            type="text"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground focus:ring-2 focus:ring-warning/40"
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isPending}
                        className="w-full flex items-center justify-center gap-2 bg-warning hover:bg-warning/90 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50"
                    >
                        {isPending ? (
                            <><Loader2 className="w-4 h-4 animate-spin" />جاري التسجيل...</>
                        ) : (
                            <><Landmark className="w-4 h-4" />تسجيل الرصيد الافتتاحي</>
                        )}
                    </button>
                </form>
            </div>
        </div>,
        document.body
    );
}
