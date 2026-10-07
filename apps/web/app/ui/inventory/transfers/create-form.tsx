'use client';

import { useState, useMemo, useEffect } from 'react';
import { prepareTransferAttempt, finishTransferAttempt, pendingTransferBody } from '@/app/lib/transfer-attempt';
import { useRouter } from 'next/navigation';
// sonner لا react-hot-toast: الجذر (app/layout.tsx) يركّب <Toaster/> الخاص بـ
// sonner فقط، فنداءات react-hot-toast كانت تُنفَّذ بصمت دون ظهور أي رسالة.
import { toast } from 'sonner';
import { PackagePlus, X, Search as SearchIcon, Building2, FileText, Package, Send, Loader2 } from 'lucide-react';

const inputClass =
    "block w-full rounded-lg border border-border py-2.5 px-4 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

export default function CreateTransferForm({
    branches,
    availableStock,
    actorId,
    sourceBranchId
}: {
    branches: { id: string, name: string }[];
    actorId: string;
    sourceBranchId: string;
    availableStock: {
        batchId: string;
        drugId: string;
        tradeName: string;
        barcode: string | null;
        batchNumber: string;
        expiryDate: Date;
        availableQuantity: number;
        costPrice: number;
    }[];
}) {
    const router = useRouter();
    const attemptName = `branch-transfer:v1:${actorId}:${sourceBranchId}`;
    const [toBranchId, setToBranchId] = useState('');
    const [notes, setNotes] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItems, setSelectedItems] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingBody, setPendingBody] = useState<any>(null);
    useEffect(() => {
        let active = true;
        if (navigator.locks) navigator.locks.request(attemptName, () => pendingTransferBody(attemptName)).then(body => {
            if (!active || !body) return;
            setPendingBody(body);
            setToBranchId(body.toBranchId);
            setNotes(body.notes || '');
            setSelectedItems(body.items.map((item: any) => ({
                ...availableStock.find(stock => stock.batchId === item.batchId), ...item,
                tradeName: availableStock.find(stock => stock.batchId === item.batchId)?.tradeName || 'دواء في محاولة التحويل السابقة',
                transferQuantity: item.quantity, availableQuantity: item.quantity,
            })));
        }).catch(error => { if (active) toast.error(error.message); });
        return () => { active = false; };
    }, [attemptName, availableStock]);

    // Filter available stock based on search
    const filteredStock = availableStock.filter((item: any) =>
        item.tradeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.barcode || '').includes(searchQuery)
    ).slice(0, 10); // Show max 10 results at a time

    const totalUnits = useMemo(
        () => selectedItems.reduce((acc: number, i: any) => acc + (i.transferQuantity || 0), 0),
        [selectedItems]
    );

    const handleAddItem = (stockItem: any) => {
        const exists = selectedItems.find((i: any) => i.batchId === stockItem.batchId);
        if (exists) {
            toast.error('هذا المنتج بهذه الدفعة مضاف مسبقاً للقائمة');
            return;
        }

        setSelectedItems([...selectedItems, { ...stockItem, transferQuantity: 1 }]);
        setSearchQuery(''); // clear search
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...selectedItems];
        newItems.splice(index, 1);
        setSelectedItems(newItems);
    };

    const handleQuantityChange = (index: number, val: number) => {
        const max = selectedItems[index].availableQuantity;
        if (val < 1) val = 1;
        if (val > max) {
            toast.error(`الرصيد المتاح هو ${max} فقط`);
            val = max;
        }

        const newItems = [...selectedItems];
        newItems[index].transferQuantity = val;
        setSelectedItems(newItems);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!toBranchId) {
            toast.error('الرجاء اختيار الفرع المستلم');
            return;
        }

        if (selectedItems.length === 0) {
            toast.error('الرجاء إضافة دواء واحد على الأقل للتحويل');
            return;
        }

        setIsSubmitting(true);

        const payload = pendingBody || {
            fromBranchId: sourceBranchId,
            toBranchId,
            notes,
            items: selectedItems.map((item: any) => ({
                batchId: item.batchId,
                drugId: item.drugId,
                batchNumber: item.batchNumber,
                expiryDate: item.expiryDate,
                quantity: item.transferQuantity,
                costPrice: item.costPrice
            }))
        };

        try {
            if (!navigator.locks) throw new Error('هذا المتصفح لا يدعم حفظ محاولة التحويل بأمان؛ استخدم متصفحًا حديثًا عبر اتصال آمن.');
            const attempt = await navigator.locks.request(attemptName, () => prepareTransferAttempt(attemptName, payload));
            setPendingBody(payload);
            const res = await fetch('/api/inventory/transfers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({...payload,idempotencyKey:attempt.key})
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'حدث خطأ أثناء الإرسال');
            await navigator.locks.request(attemptName, () => finishTransferAttempt(attemptName, attempt.key));
            setPendingBody(null);

            toast.success('تم إرسال التحويل بنجاح');
            router.push('/dashboard/inventory/transfers?tab=outgoing');
            router.refresh();
        } catch (error: any) {
            toast.error(error.message);
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {pendingBody && <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">توجد محاولة تحويل سابقة لم تتأكد نتيجتها. زر الإرسال يتحقق منها بمفتاحها نفسه دون خصم جديد؛ أعد المحاولة قبل إنشاء تحويل آخر.</p>}
            {/* الفرع المستلم + ملاحظات */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        الفرع المستلم (الوجهة) <span className="text-destructive">*</span>
                    </label>
                    <select
                        disabled={!!pendingBody || isSubmitting}
                        value={toBranchId}
                        onChange={(e) => setToBranchId(e.target.value)}
                        className={inputClass}
                        required
                    >
                        <option value="" disabled>-- اختر الفرع المستلم --</option>
                        {branches.map((b: any) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        ملاحظات التحويل
                    </label>
                    <input
                        type="text"
                        value={notes}
                        disabled={!!pendingBody || isSubmitting}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="معلومات إضافية عن سبب التحويل..."
                        className={inputClass}
                    />
                </div>
            </div>

            {/* قائمة الأدوية */}
            <div className="border-t border-border pt-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Package className="w-5 h-5 text-primary" />
                        قائمة الأدوية المحوّلة
                    </h3>
                    {selectedItems.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                            {selectedItems.length} صنف — {totalUnits} عبوة
                        </span>
                    )}
                </div>

                {/* البحث */}
                <div className="relative mb-4 w-full md:w-2/3">
                    <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        disabled={!!pendingBody || isSubmitting}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ابحث عن دواء في رصيدك (الاسم أو الباركود)..."
                        className="block w-full rounded-lg border border-border py-2.5 pr-10 pl-4 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />

                    {/* نتائج البحث */}
                    {searchQuery.length > 1 && (
                        <div className="absolute z-10 w-full mt-1 bg-card rounded-lg shadow-lg border border-border max-h-60 overflow-auto">
                            {filteredStock.length > 0 ? (
                                filteredStock.map((item: any, idx: any) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        disabled={!!pendingBody || isSubmitting}
                                        onClick={() => handleAddItem(item)}
                                        className="w-full text-right px-4 py-3 hover:bg-muted/60 border-b border-border last:border-0 flex justify-between items-center gap-3 transition-colors"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm text-foreground truncate">{item.tradeName}</p>
                                            <p className="text-xs text-muted-foreground" dir="ltr">
                                                {item.barcode || '—'} · دفعة {item.batchNumber}
                                            </p>
                                        </div>
                                        <span className="shrink-0 bg-success/10 text-success border border-success/20 text-xs px-2 py-1 rounded-md font-bold">
                                            متاح: {item.availableQuantity}
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <div className="p-4 text-sm text-muted-foreground text-center">لا توجد نتائج في رصيدك</div>
                            )}
                        </div>
                    )}
                </div>

                {/* الأصناف المختارة */}
                {selectedItems.length > 0 ? (
                    <div className="rounded-xl border border-border overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-right text-sm">
                                <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                                    <tr>
                                        <th className="px-5 py-3 font-medium font-cairo">اسم الدواء</th>
                                        <th className="px-5 py-3 font-medium font-cairo">الدفعة / الصلاحية</th>
                                        <th className="px-5 py-3 font-medium font-cairo w-36">الكمية المحوّلة</th>
                                        <th className="px-5 py-3 font-medium font-cairo w-16 text-center">حذف</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border bg-card">
                                    {selectedItems.map((item: any, idx: any) => (
                                        <tr key={idx} className="hover:bg-muted/40 transition-colors">
                                            <td className="px-5 py-3 font-semibold text-foreground">{item.tradeName}</td>
                                            <td className="px-5 py-3">
                                                <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded text-xs" dir="ltr">{item.batchNumber}</span>
                                                <span className="text-muted-foreground text-xs block mt-1" dir="ltr">
                                                    تنتهي: {new Date(item.expiryDate).toLocaleDateString('en-GB', { timeZone: 'Asia/Baghdad' })}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <input
                                                    type="number"
                                                    disabled={!!pendingBody || isSubmitting}
                                                    min="1"
                                                    max={item.availableQuantity}
                                                    value={item.transferQuantity}
                                                    onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 1)}
                                                    className="block w-full rounded-lg border border-border py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-center font-bold bg-background text-foreground transition-colors"
                                                />
                                                <p className="text-[10px] text-muted-foreground mt-1 text-center">أقصى حد: {item.availableQuantity}</p>
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveItem(idx)}
                                                    disabled={!!pendingBody || isSubmitting}
                                                    className="text-destructive p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                                                    title="حذف"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="border-2 border-dashed border-border rounded-xl p-10 text-center text-muted-foreground bg-muted/30">
                        <PackagePlus className="w-10 h-10 mx-auto text-muted-foreground/60 mb-2" />
                        ابحث عن الأدوية أعلاه لإضافتها لقائمة التحويل
                    </div>
                )}
            </div>

            {/* الأزرار */}
            <div className="flex justify-end gap-3 border-t border-border pt-6">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                    إلغاء
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting || selectedItems.length === 0}
                    className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري إرسال التحويل...</>
                        : <><Send className="w-4 h-4" /> تأكيد إرسال الأدوية للفرع</>
                    }
                </button>
            </div>
        </form>
    );
}
