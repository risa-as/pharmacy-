'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader2 } from 'lucide-react';

interface BatchData {
    id: string;
    batchNumber: string;
    costPrice: number;
    quantity: number;
    expiryDate: string; // ISO string
    supplierId: string | null;
    drugName: string;
}

interface Supplier {
    id: string;
    name: string;
}

interface EditBatchModalProps {
    batch: BatchData | null;
    suppliers: Supplier[];
    onClose: () => void;
    onSaved: () => void;
}

export default function EditBatchModal({ batch, suppliers, onClose, onSaved }: EditBatchModalProps) {
    const [batchNumber, setBatchNumber] = useState('');
    const [costPrice, setCostPrice] = useState('');
    const [quantity, setQuantity] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (batch) {
            setBatchNumber(batch.batchNumber);
            setCostPrice(String(batch.costPrice));
            setQuantity(String(batch.quantity));
            setExpiryDate(batch.expiryDate.split('T')[0]); // YYYY-MM-DD
            setSupplierId(batch.supplierId || '');
            setError(null);
        }
    }, [batch]);

    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    if (!batch || !mounted) return null;

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/batches/${batch.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    batchNumber: batchNumber.trim(),
                    costPrice: parseFloat(costPrice),
                    quantity: parseInt(quantity),
                    expiryDate: new Date(expiryDate).toISOString(),
                    supplierId: supplierId || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'حدث خطأ');
                return;
            }
            onSaved();
        } catch {
            setError('فشل الاتصال بالخادم');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" dir="rtl">
            <div className="bg-card rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-primary p-4 text-primary-foreground flex justify-between items-center">
                    <h2 className="text-lg font-bold">
                        تعديل الدفعة — {batch.drugName}
                    </h2>
                    <button onClick={onClose} className="text-primary-foreground/70 hover:text-primary-foreground transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {error && (
                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">رقم الدفعة</label>
                        <input
                            type="text"
                            value={batchNumber}
                            onChange={e => setBatchNumber(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">سعر الشراء (للوحدة)</label>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={costPrice}
                            onChange={e => setCostPrice(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">الكمية</label>
                        <input
                            type="number"
                            min="0"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">تاريخ الانتهاء</label>
                        <input
                            type="date"
                            value={expiryDate}
                            onChange={e => setExpiryDate(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">المورد</label>
                        <select
                            value={supplierId}
                            onChange={e => setSupplierId(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        >
                            <option value="">بدون مورد</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-muted/50 flex gap-3">
                    <button
                        onClick={handleSave}
                        disabled={saving || !batchNumber.trim() || !costPrice || !quantity || !expiryDate}
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-background border border-border rounded-lg font-medium hover:bg-muted transition-colors"
                    >
                        إلغاء
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
