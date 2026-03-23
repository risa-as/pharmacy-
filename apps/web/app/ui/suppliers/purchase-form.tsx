'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Search, ShoppingCart, Loader2, Save, X, PackageCheck } from 'lucide-react';
import { createPurchase } from '@/app/lib/actions/purchases';

type Drug = { id: string; tradeName: string; barcode: string; scientificName: string };
type Branch = { id: string; name: string };

type LineItem = {
    drugId: string;
    tradeName: string;
    barcode: string;
    quantity: number;
    cost: number;
    expiryDate: string;
    batchNumber: string;
};

interface PurchaseFormProps {
    supplierId: string;
    supplierName: string;
    branches: Branch[];
    drugs: Drug[];
    defaultInvoiceNumber?: string;
}

export default function PurchaseForm({ supplierId, supplierName, branches, drugs, defaultInvoiceNumber }: PurchaseFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const [branchId, setBranchId] = useState(branches[0]?.id || '');
    const [invoiceNumber, setInvoiceNumber] = useState(defaultInvoiceNumber || '');
    const [items, setItems] = useState<LineItem[]>([]);

    // Drug search state
    const [drugSearch, setDrugSearch] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    const filteredDrugs = drugSearch.length >= 1
        ? drugs.filter(d =>
            d.tradeName.toLowerCase().includes(drugSearch.toLowerCase()) ||
            d.barcode.includes(drugSearch) ||
            d.scientificName.toLowerCase().includes(drugSearch.toLowerCase())
        ).slice(0, 10)
        : [];

    const addDrug = (drug: Drug) => {
        const existing = items.find(i => i.drugId === drug.id);
        if (existing) {
            setItems(prev => prev.map(i =>
                i.drugId === drug.id ? { ...i, quantity: i.quantity + 1 } : i
            ));
        } else {
            const defaultExpiry = new Date();
            defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 2);
            const today = new Date();
            const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
            const autoBatch = `B-${ymd}-${drug.barcode.slice(-4).toUpperCase()}`;
            setItems(prev => [...prev, {
                drugId: drug.id,
                tradeName: drug.tradeName,
                barcode: drug.barcode,
                quantity: 1,
                cost: 0,
                expiryDate: defaultExpiry.toISOString().split('T')[0],
                batchNumber: autoBatch,
            }]);
        }
        setDrugSearch('');
        setSearchOpen(false);
    };

    const updateItem = (drugId: string, field: keyof LineItem, value: any) => {
        setItems(prev => prev.map(i => i.drugId === drugId ? { ...i, [field]: value } : i));
    };

    const removeItem = (drugId: string) => {
        setItems(prev => prev.filter(i => i.drugId !== drugId));
    };

    const total = items.reduce((sum, i) => sum + i.cost * i.quantity, 0);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (items.length === 0) { setError('يجب إضافة صنف واحد على الأقل'); return; }
        const hasZeroCost = items.some(i => i.cost <= 0);
        if (hasZeroCost) { setError('يجب إدخال سعر التكلفة لجميع الأصناف'); return; }
        setError('');

        startTransition(async () => {
            const result = await createPurchase({
                supplierId,
                branchId,
                invoiceNumber: invoiceNumber || undefined,
                items: items.map(i => ({
                    drugId: i.drugId,
                    quantity: i.quantity,
                    cost: i.cost,
                    expiryDate: i.expiryDate || undefined,
                    batchNumber: i.batchNumber || undefined,
                })),
            });

            if (result.success) {
                setSuccess(true);
                router.push(`/dashboard/suppliers/${supplierId}/purchases`);
                router.refresh();
            } else {
                setError(result.error || 'فشل في إنشاء الفاتورة');
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6" dir="rtl">
            {/* Header Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Branch */}
                {branches.length > 1 ? (
                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">الفرع *</label>
                        <select
                            value={branchId}
                            onChange={e => setBranchId(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:ring-2 focus:ring-ring/20"
                            required
                        >
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                ) : (
                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">الفرع</label>
                        <div className="rounded-lg border border-border bg-muted px-4 py-2.5 text-foreground text-sm">
                            {branches[0]?.name || '—'}
                        </div>
                    </div>
                )}

                {/* Invoice Number */}
                <div>
                    <label className="block text-sm font-bold text-foreground mb-1">رقم الفاتورة (اختياري)</label>
                    <input
                        type="text"
                        value={invoiceNumber}
                        onChange={e => setInvoiceNumber(e.target.value)}
                        placeholder="مثال: INV-2024-001"
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:ring-2 focus:ring-ring/20"
                        dir="ltr"
                    />
                </div>

                {/* Supplier (read-only) */}
                <div>
                    <label className="block text-sm font-bold text-foreground mb-1">المورد</label>
                    <div className="rounded-lg border border-border bg-muted px-4 py-2.5 text-foreground text-sm font-bold">
                        {supplierName}
                    </div>
                </div>
            </div>

            {/* Drug Search */}
            <div>
                <label className="block text-sm font-bold text-foreground mb-2">إضافة دواء</label>
                <div ref={searchRef} className="relative">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 focus-within:ring-2 focus-within:ring-ring/20">
                        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                        <input
                            type="text"
                            value={drugSearch}
                            onChange={e => { setDrugSearch(e.target.value); setSearchOpen(true); }}
                            onFocus={() => setSearchOpen(true)}
                            placeholder="ابحث بالاسم أو الباركود..."
                            className="flex-1 bg-transparent outline-none text-sm"
                        />
                        {drugSearch && (
                            <button type="button" onClick={() => { setDrugSearch(''); setSearchOpen(false); }}>
                                <X className="w-4 h-4 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                    {searchOpen && filteredDrugs.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                            {filteredDrugs.map(drug => (
                                <button
                                    key={drug.id}
                                    type="button"
                                    onClick={() => addDrug(drug)}
                                    className="w-full text-right px-4 py-2.5 text-sm hover:bg-muted transition-colors flex items-center gap-3"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <PackageCheck className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-foreground">{drug.tradeName}</p>
                                        <p className="text-xs text-muted-foreground font-mono">{drug.barcode}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Items Table */}
            {items.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden">
                    <div className="bg-muted px-4 py-3 border-b border-border flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4 text-primary" />
                        <span className="font-bold text-sm text-foreground">أصناف الفاتورة ({items.length})</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-muted/50 text-right text-xs font-semibold text-muted-foreground border-b border-border">
                                <tr>
                                    <th className="px-4 py-2.5">#</th>
                                    <th className="px-4 py-2.5">الدواء</th>
                                    <th className="px-4 py-2.5 w-24">الكمية</th>
                                    <th className="px-4 py-2.5 w-32">سعر الشريط</th>
                                    <th className="px-4 py-2.5 w-36">تاريخ الانتهاء</th>
                                    <th className="px-4 py-2.5 w-32">رقم الدفعة</th>
                                    <th className="px-4 py-2.5 w-24 text-left">الإجمالي</th>
                                    <th className="px-4 py-2.5 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {items.map((item, idx) => (
                                    <tr key={item.drugId} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                                        <td className="px-4 py-2.5">
                                            <p className="font-medium text-foreground">{item.tradeName}</p>
                                            <p className="text-xs text-muted-foreground font-mono">{item.barcode}</p>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <input
                                                type="number"
                                                min="1"
                                                value={item.quantity}
                                                onChange={e => updateItem(item.drugId, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm focus:ring-2 focus:ring-ring/20"
                                            />
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={item.cost || ''}
                                                onChange={e => updateItem(item.drugId, 'cost', parseFloat(e.target.value) || 0)}
                                                placeholder="0"
                                                className={`w-28 rounded-lg border px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-ring/20 ${item.cost <= 0 ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-background'}`}
                                                dir="ltr"
                                            />
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <input
                                                type="date"
                                                value={item.expiryDate}
                                                onChange={e => updateItem(item.drugId, 'expiryDate', e.target.value)}
                                                className="w-34 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:ring-2 focus:ring-ring/20"
                                                dir="ltr"
                                            />
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <input
                                                type="text"
                                                value={item.batchNumber}
                                                onChange={e => updateItem(item.drugId, 'batchNumber', e.target.value)}
                                                placeholder="اختياري"
                                                className="w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:ring-2 focus:ring-ring/20"
                                                dir="ltr"
                                            />
                                        </td>
                                        <td className="px-4 py-2.5 text-left font-bold text-foreground tabular-nums" dir="ltr">
                                            {(item.cost * item.quantity).toLocaleString('en')}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <button
                                                type="button"
                                                onClick={() => removeItem(item.drugId)}
                                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Total */}
                    <div className="bg-muted/50 px-6 py-4 border-t border-border flex items-center justify-between">
                        <span className="font-bold text-foreground text-sm">الإجمالي الكلي للفاتورة</span>
                        <div className="text-left">
                            <span className="text-2xl font-black text-primary tabular-nums" dir="ltr">
                                {total.toLocaleString('en')}
                            </span>
                            <span className="text-sm text-muted-foreground mr-1">د.ع</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {items.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-border py-14 text-center">
                    <ShoppingCart className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">ابحث وأضف أدوية للفاتورة من الحقل أعلاه</p>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    type="submit"
                    disabled={isPending || items.length === 0}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                >
                    {isPending ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />جاري الحفظ...</>
                    ) : (
                        <><Save className="w-4 h-4" />حفظ الفاتورة</>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex items-center gap-2 bg-muted hover:bg-muted/80 text-foreground px-6 py-3 rounded-xl font-bold transition-all"
                >
                    إلغاء
                </button>
            </div>
        </form>
    );
}
