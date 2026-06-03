"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Pencil, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

interface SaleEditModalProps {
    sale: any;
    isOpen: boolean;
    onClose: () => void;
}

interface EditRow {
    drugId: string;
    name: string;
    quantity: number;
    price: number;
}

export default function SaleEditModal({ sale, isOpen, onClose }: SaleEditModalProps) {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [rows, setRows] = useState<EditRow[]>([]);
    const [discount, setDiscount] = useState(0);

    useEffect(() => { setMounted(true); }, []);

    // Seed local edit state whenever a new sale is opened
    useEffect(() => {
        if (sale) {
            const subtotal = (sale.items ?? []).reduce((s: number, i: any) => s + i.quantity * i.price, 0);
            setRows(
                (sale.items ?? []).map((i: any) => ({
                    drugId: i.drugId,
                    name: i.drug?.tradeName || i.name || "غير معروف",
                    quantity: i.quantity,
                    price: i.price,
                }))
            );
            // Derive the existing discount amount from subtotal vs stored total
            setDiscount(Math.max(0, Math.round(subtotal - sale.total)));
        }
    }, [sale]);

    const subtotal = useMemo(() => rows.reduce((s, r) => s + r.quantity * r.price, 0), [rows]);
    const total = Math.max(0, subtotal - discount);

    if (!isOpen || !sale || !mounted) return null;

    const hasReturns = sale.returns && sale.returns.length > 0;

    const updateRow = (drugId: string, field: "quantity" | "price", value: string) => {
        const num = Math.max(0, Number(value) || 0);
        setRows((prev) => prev.map((r) => (r.drugId === drugId ? { ...r, [field]: num } : r)));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (hasReturns) {
            toast.error("لا يمكن تعديل فاتورة فيها مرتجعات");
            return;
        }
        if (rows.every((r) => r.quantity <= 0)) {
            toast.error("يجب أن تحتوي الفاتورة على صنف واحد على الأقل");
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/sales/${sale.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: rows.map((r) => ({ drugId: r.drugId, quantity: r.quantity, price: r.price })),
                    discount,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "تعذّر تعديل الفاتورة");

            toast.success("تم تعديل الفاتورة بنجاح");
            onClose();
            router.refresh();
        } catch (error: any) {
            toast.error(error.message || "حدث خطأ غير متوقع");
        } finally {
            setIsLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" dir="rtl">
            <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border bg-primary/10 text-primary">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Pencil className="w-6 h-6" />
                            تعديل الفاتورة
                        </h2>
                        <p className="text-sm mt-1 opacity-80">
                            رقم الفاتورة:{" "}
                            <span className="font-mono font-bold">
                                #{sale.invoiceNumber != null ? String(sale.invoiceNumber).padStart(4, "0") : sale.id.slice(0, 8)}
                            </span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-primary/20 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="p-6 max-h-[60vh] overflow-y-auto">
                        {hasReturns ? (
                            <div className="bg-destructive/10 text-destructive p-4 rounded-xl flex gap-3 text-sm border border-destructive/20">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <p>هذه الفاتورة تحتوي على مرتجعات ولا يمكن تعديلها. يرجى التعامل مع المرتجعات أولاً.</p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-primary/10 text-primary p-4 rounded-xl flex gap-3 text-sm mb-6 border border-primary/20">
                                    <AlertCircle className="w-5 h-5 shrink-0" />
                                    <p>عدّل الكميات والأسعار والخصم. سيتم تعديل المخزون والصندوق (أو دين العميل) آلياً وفق الفرق.</p>
                                </div>

                                <div className="border border-border rounded-xl overflow-hidden mb-6">
                                    <table className="w-full text-sm">
                                        <thead className="bg-card/50 text-muted-foreground font-bold border-b border-border">
                                            <tr>
                                                <th className="px-4 py-3 text-right">المادة</th>
                                                <th className="px-4 py-3 text-center">الكمية</th>
                                                <th className="px-4 py-3 text-center">السعر</th>
                                                <th className="px-4 py-3 text-center">المجموع</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {rows.map((row) => (
                                                <tr key={row.drugId} className="hover:bg-muted/30">
                                                    <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            disabled={isLoading}
                                                            value={row.quantity}
                                                            onChange={(e) => updateRow(row.drugId, "quantity", e.target.value)}
                                                            className="w-20 text-center border-border rounded-lg shadow-sm focus:border-primary focus:ring-primary disabled:bg-muted"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            disabled={isLoading}
                                                            value={row.price}
                                                            onChange={(e) => updateRow(row.drugId, "price", e.target.value)}
                                                            className="w-24 text-center border-border rounded-lg shadow-sm focus:border-primary focus:ring-primary disabled:bg-muted"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold text-foreground">
                                                        {(row.quantity * row.price).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="space-y-2 bg-muted/50 p-4 rounded-xl border border-border">
                                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                                        <span>المجموع قبل الخصم</span>
                                        <span className="font-bold text-foreground">{subtotal.toLocaleString()} د.ع</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-medium text-foreground">الخصم / التخفيض</label>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                disabled={isLoading}
                                                value={discount}
                                                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                                                className="w-28 text-center border-border rounded-lg shadow-sm focus:border-primary focus:ring-primary disabled:bg-muted"
                                            />
                                            <span className="text-sm text-muted-foreground">د.ع</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center border-t border-border pt-2">
                                        <span className="font-bold text-foreground">الإجمالي النهائي</span>
                                        <span className="text-xl font-bold text-primary">{total.toLocaleString()} د.ع</span>
                                    </div>
                                </div>
                            </>
                        )}
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
                            disabled={isLoading || hasReturns}
                            className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    جاري الحفظ...
                                </>
                            ) : (
                                "حفظ التعديلات"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
