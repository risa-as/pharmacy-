"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Undo2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

interface SaleReturnModalProps {
    sale: any;
    isOpen: boolean;
    onClose: () => void;
}

export default function SaleReturnModal({ sale, isOpen, onClose }: SaleReturnModalProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [notes, setNotes] = useState("");
    const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Calculate previously returned quantities if any
    const returnedItems = useMemo(() => {
        const counts: Record<string, number> = {};
        if (sale?.returns) {
            sale.returns.forEach((r: any) => {
                r.items.forEach((item: any) => {
                    counts[item.drugId] = (counts[item.drugId] || 0) + item.quantity;
                });
            });
        }
        return counts;
    }, [sale]);

    if (!isOpen || !sale) return null;

    const handleQuantityChange = (drugId: string, value: string, maxQty: number) => {
        const qty = parseInt(value) || 0;
        if (qty < 0) return;
        if (qty > maxQty) return;

        setReturnQuantities(prev => ({
            ...prev,
            [drugId]: qty
        }));
    };

    const totalReturnAmount = sale.items.reduce((acc: number, item: any) => {
        const returnQty = returnQuantities[item.drugId] || 0;
        return acc + (returnQty * item.price);
    }, 0);

    const hasItemsToReturn = Object.values(returnQuantities).some((qty: any) => qty > 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!hasItemsToReturn) {
            toast.error("يرجى تحديد عنصر واحد على الأقل للإرجاع");
            return;
        }

        setIsLoading(true);
        try {
            const itemsToReturn = Object.keys(returnQuantities)
                .filter((drugId: any) => returnQuantities[drugId] > 0)
                .map((drugId: any) => ({
                    drugId,
                    quantity: returnQuantities[drugId],
                    price: sale.items.find((i: any) => i.drugId === drugId)?.price || 0
                }));

            const res = await fetch(`/api/sales/${sale.id}/return`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: itemsToReturn,
                    notes,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "حدث خطأ أثناء معالجة الإرجاع");
            }

            toast.success("تم إرجاع المواد بنجاح");
            setReturnQuantities({});
            setNotes("");
            onClose();
            router.refresh();
        } catch (error: any) {
            toast.error(error.message || "حدث خطأ غير متوقع");
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen || !sale || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" dir="rtl">
            <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border bg-destructive/10 text-destructive">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Undo2 className="w-6 h-6" />
                            إرجاع مواد من الفاتورة
                        </h2>
                        <p className="text-sm mt-1 opacity-80">رقم الفاتورة: <span className="font-mono font-bold">{sale.id}</span></p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-destructive/20 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="p-6 max-h-[60vh] overflow-y-auto">
                        <div className="bg-primary/10 text-primary p-4 rounded-xl flex gap-3 text-sm mb-6 border border-primary/20">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <p>قم بتحديد الكمية التي ترغب بإرجاعها من كل صنف. سيتم إعادة المخزون للصيدلية وتعديل الصندوق آلياً.</p>
                        </div>

                        <div className="border border-border rounded-xl overflow-hidden mb-6">
                            <table className="w-full text-sm">
                                <thead className="bg-card/50 text-muted-foreground font-bold border-b border-border">
                                    <tr>
                                        <th className="px-4 py-3 text-right">المادة</th>
                                        <th className="px-4 py-3 text-center">السعر</th>
                                        <th className="px-4 py-3 text-center">المتوفر للإرجاع</th>
                                        <th className="px-4 py-3 text-center">الكمية المرجعة</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {sale.items?.map((item: any, idx: number) => {
                                        const alreadyReturned = returnedItems[item.drugId] || 0;
                                        const maxReturnable = item.quantity - alreadyReturned;

                                        if (item.quantity <= 0) return null;

                                        return (
                                            <tr key={idx} className={`hover:bg-muted/30 ${maxReturnable === 0 ? 'opacity-50 bg-muted/30' : ''}`}>
                                                <td className="px-4 py-3 font-medium text-foreground">
                                                    {item.drug?.tradeName || item.name || 'غير معروف'}
                                                    {alreadyReturned > 0 && (
                                                        <span className="block text-xs text-warning mt-1">
                                                            (تم إرجاع {alreadyReturned} سابقاً)
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center text-muted-foreground">{item.price.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-center text-muted-foreground font-bold">
                                                    {maxReturnable}
                                                    {maxReturnable === 0 && <span className="text-xs text-destructive block">لا يمكن الإرجاع</span>}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={maxReturnable}
                                                        disabled={maxReturnable === 0 || isLoading}
                                                        value={returnQuantities[item.drugId] || ''}
                                                        onChange={(e) => handleQuantityChange(item.drugId, e.target.value, maxReturnable)}
                                                        className="w-20 text-center border-border rounded-lg shadow-sm focus:border-destructive focus:ring-destructive disabled:bg-muted"
                                                        placeholder="0"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-foreground mb-2">ملاحظات الإرجاع (اختياري)</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                disabled={isLoading}
                                className="w-full rounded-xl border-border shadow-sm focus:border-destructive focus:ring-destructive"
                                rows={2}
                                placeholder="سبب الإرجاع..."
                            ></textarea>
                        </div>

                        <div className="bg-muted/50 p-4 rounded-xl border border-border flex justify-between items-center">
                            <span className="font-bold text-foreground">إجمالي المبلغ المسترد:</span>
                            <span className="text-xl font-bold text-destructive">{totalReturnAmount.toLocaleString()} د.ع</span>
                        </div>
                    </div>

                    <div className="p-4 border-t border-border bg-muted/30 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="px-6 py-2 bg-card border border-border hover:bg-muted text-foreground rounded-lg font-bold transition-colors disabled:opacity-50"
                        >
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            disabled={!hasItemsToReturn || isLoading}
                            className="px-6 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-lg font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    جاري المعالجة...
                                </>
                            ) : (
                                "تأكيد الإرجاع"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
