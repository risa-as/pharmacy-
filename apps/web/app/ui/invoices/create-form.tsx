"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createPurchase } from "@/app/lib/actions/invoice";
import { useFormState } from "react-dom";
import { Plus, FileText, ArrowRight } from "lucide-react";
import { DeleteButton } from "../delete-button";

interface FormProps {
    suppliers: { id: string; name: string }[];
    branches: { id: string; name: string }[];
    drugs: { id: string; tradeName: string; barcode: string }[];
    defaultInvoiceNumber?: string;
}

export default function Form({ suppliers, branches, drugs, defaultInvoiceNumber }: FormProps) {
    const initialState: any = { message: "", errors: {} };
    // @ts-ignore
    const [state, dispatch] = useFormState(createPurchase, initialState);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // حالة السلة
    const [items, setItems] = useState<any[]>([]);

    // حالة العنصر الجديد
    const [selectedDrug, setSelectedDrug] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [cost, setCost] = useState(0);
    const [sellingPrice, setSellingPrice] = useState(0);
    const [expiryDate, setExpiryDate] = useState("");

    const generateBatchNumber = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    };

    const addItem = () => {
        if (!selectedDrug || quantity <= 0 || cost <= 0 || !expiryDate) {
            alert("يرجى ملء جميع حقول العنصر بشكل صحيح.");
            return;
        }

        const drug = drugs.find((d: any) => d.id === selectedDrug);

        setItems([...items, {
            drugId: selectedDrug,
            drugName: drug?.tradeName,
            quantity,
            cost,
            sellingPrice,
            expiryDate,
            batchNumber: generateBatchNumber()
        }]);

        // إعادة تعيين الحقول
        setSelectedDrug("");
        setQuantity(1);
        setCost(0);
        setSellingPrice(0);
        setExpiryDate("");
    };

    const removeItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const totalAmount = items.reduce((acc: any, item: any) => acc + (item.quantity * item.cost), 0);

    if (!mounted) {
        return (
            <div className="space-y-6" suppressHydrationWarning>
                <div className="rounded-xl bg-card border border-border p-6 shadow-sm h-48 animate-pulse" />
                <div className="rounded-xl bg-card border border-border p-6 shadow-sm h-64 animate-pulse" />
            </div>
        );
    }

    return (
        <form action={dispatch} className="space-y-6" suppressHydrationWarning>
            {/* معلومات الفاتورة */}
            <div className="rounded-xl bg-card border border-border p-6 shadow-sm">
                <h3 className="text-lg font-bold text-foreground mb-4">معلومات الفاتورة</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="supplierId" className="mb-2 block text-sm font-bold text-foreground">
                            المورد
                        </label>
                        <select
                            id="supplierId"
                            name="supplierId"
                            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                            defaultValue=""
                            required
                        >
                            <option value="" disabled>اختر المورد</option>
                            {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="branchId" className="mb-2 block text-sm font-bold text-foreground">
                            الفرع
                        </label>
                        <select
                            id="branchId"
                            name="branchId"
                            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                            defaultValue=""
                            required
                        >
                            <option value="" disabled>اختر الفرع</option>
                            {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="invoiceNumber" className="mb-2 block text-sm font-bold text-foreground">
                            رقم الفاتورة (اختياري)
                        </label>
                        <input
                            id="invoiceNumber"
                            name="invoiceNumber"
                            type="text"
                            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                            placeholder="INV-2024-001"
                            defaultValue={defaultInvoiceNumber}
                            dir="ltr"
                        />
                    </div>
                </div>
            </div>

            {/* إضافة عناصر */}
            <div className="rounded-xl bg-card border border-border p-6 shadow-sm">
                <h3 className="text-lg font-bold text-foreground mb-4">إضافة أصناف</h3>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div className="col-span-2">
                        <label className="text-xs font-bold text-muted-foreground">الدواء</label>
                        <select
                            value={selectedDrug}
                            onChange={e => setSelectedDrug(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/20"
                        >
                            <option value="">اختر الدواء...</option>
                            {drugs.map((d: any) => <option key={d.id} value={d.id}>{d.tradeName} ({d.barcode})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-muted-foreground">تاريخ الانتهاء</label>
                        <input
                            type="date"
                            value={expiryDate}
                            onChange={e => setExpiryDate(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/20"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-muted-foreground">الكمية</label>
                        <input
                            type="number"
                            value={quantity}
                            onChange={e => setQuantity(Number(e.target.value))}
                            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/20"
                            min="1"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-muted-foreground">سعر الشراء</label>
                        <input
                            type="number"
                            value={cost}
                            onChange={e => setCost(Number(e.target.value))}
                            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/20"
                            min="0"
                            step="0.01"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-muted-foreground">سعر البيع</label>
                        <input
                            type="number"
                            value={sellingPrice}
                            onChange={e => setSellingPrice(Number(e.target.value))}
                            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/20"
                            min="0"
                            step="0.01"
                        />
                    </div>
                    <div className="col-span-2 md:col-span-6 mt-2">
                        <button
                            type="button"
                            onClick={addItem}
                            className="w-full flex items-center justify-center gap-2 bg-success hover:bg-success/90 text-success-foreground py-2.5 rounded-lg font-bold transition-all"
                        >
                            <Plus className="w-5 h-5" />
                            إضافة للفاتورة
                        </button>
                    </div>
                </div>
            </div>

            {/* جدول العناصر */}
            <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted text-right">
                            <th className="px-4 py-3 font-bold text-foreground">الدواء</th>
                            <th className="px-4 py-3 font-bold text-foreground">الدفعة</th>
                            <th className="px-4 py-3 font-bold text-foreground">الانتهاء</th>
                            <th className="px-4 py-3 font-bold text-foreground">الكمية</th>
                            <th className="px-4 py-3 font-bold text-foreground">السعر</th>
                            <th className="px-4 py-3 font-bold text-foreground">الإجمالي</th>
                            <th className="px-4 py-3 font-bold text-foreground">حذف</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item: any, idx: any) => (
                            <tr key={idx} className="border-b hover:bg-muted">
                                <td className="px-4 py-3 font-medium">{item.drugName}</td>
                                <td className="px-4 py-3 font-mono text-xs">{item.batchNumber}</td>
                                <td className="px-4 py-3">{item.expiryDate}</td>
                                <td className="px-4 py-3">{item.quantity}</td>
                                <td className="px-4 py-3">{item.cost.toLocaleString()}</td>
                                <td className="px-4 py-3 font-bold">{(item.quantity * item.cost).toLocaleString()}</td>
                                <td className="px-4 py-3">
                                    <DeleteButton
                                        onConfirm={() => removeItem(idx)}
                                        description="الصنف من الفاتورة"
                                        className="text-destructive hover:text-destructive border-none p-1 hover:bg-destructive/10 rounded w-auto h-auto"
                                    />
                                </td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                    لم يتم إضافة أصناف بعد
                                </td>
                            </tr>
                        )}
                    </tbody>
                    {items.length > 0 && (
                        <tfoot>
                            <tr className="bg-primary/10 font-bold text-foreground">
                                <td colSpan={5} className="px-4 py-3 text-left">إجمالي الفاتورة:</td>
                                <td colSpan={2} className="px-4 py-3">{totalAmount.toLocaleString()} د.ع</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            <input type="hidden" name="itemsData" value={JSON.stringify(items)} />

            {/* رسالة الخطأ */}
            {state.message && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
                    {state.message}
                </div>
            )}

            {/* الأزرار */}
            <div className="flex gap-4">
                <button
                    type="submit"
                    className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <FileText className="h-5 w-5" />
                    حفظ الفاتورة
                </button>
                <Link
                    href="/dashboard/invoices"
                    className="flex items-center gap-2 rounded-lg bg-muted px-6 py-3 font-bold text-muted-foreground transition-colors hover:bg-muted"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
