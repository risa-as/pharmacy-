"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { createPrescription } from "@/app/lib/actions/prescription";
import { FileText, Plus, ArrowRight } from "lucide-react";
import { DeleteButton } from "../delete-button";

interface FormProps {
    patients: { id: string; name: string; phone: string }[];
    drugs: { id: string; tradeName: string; barcode: string }[];
}

export default function CreatePrescriptionForm({ patients, drugs }: FormProps) {
    const initialState: any = { message: "", errors: {} };
    const [state, dispatch] = useFormState(createPrescription, initialState);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const [items, setItems] = useState<any[]>([]);

    const [selectedDrug, setSelectedDrug] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [dosage, setDosage] = useState("");
    const [instructions, setInstructions] = useState("");



    const addItem = () => {
        if (!selectedDrug || quantity <= 0) {
            alert("يرجى اختيار الدواء والكمية");
            return;
        }

        const drug = drugs.find((d) => d.id === selectedDrug);

        const newItems = [
            ...items,
            {
                drugId: selectedDrug,
                drugName: drug?.tradeName,
                quantity,
                dosage,
                instructions,
            },
        ];

        setItems(newItems);

        setSelectedDrug("");
        setQuantity(1);
        setDosage("");
        setInstructions("");
    };

    const removeItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

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
            {/* معلومات الوصفة */}
            <div className="rounded-xl bg-card border border-border p-6 shadow-sm">
                <h3 className="text-lg font-bold text-foreground mb-4">معلومات الوصفة</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="patientId" className="mb-2 block text-sm font-bold text-foreground">
                            المريض
                        </label>
                        <select
                            id="patientId"
                            name="patientId"
                            className="w-full rounded-lg border border-border bg-background px-4 py-3 focus:border-ring focus:ring-2 focus:ring-ring/20"
                            required
                        >
                            <option value="">اختر المريض</option>
                            {patients.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} ({p.phone})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="doctorName" className="mb-2 block text-sm font-bold text-foreground">
                            اسم الطبيب
                        </label>
                        <input
                            id="doctorName"
                            name="doctorName"
                            type="text"
                            placeholder="اختياري"
                            className="w-full rounded-lg border border-border bg-background px-4 py-3 focus:border-ring focus:ring-2 focus:ring-ring/20"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="clinicName" className="mb-2 block text-sm font-bold text-foreground">
                            العيادة / المستشفى
                        </label>
                        <input
                            id="clinicName"
                            name="clinicName"
                            type="text"
                            placeholder="اختياري"
                            className="w-full rounded-lg border border-border bg-background px-4 py-3 focus:border-ring focus:ring-2 focus:ring-ring/20"
                        />
                    </div>
                </div>
            </div>



            {/* إضافة أدوية */}
            <div className="rounded-xl bg-card border border-border p-6 shadow-sm">
                <h3 className="text-lg font-bold text-foreground mb-4">الأدوية</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="col-span-2">
                        <label className="text-xs font-bold text-muted-foreground">الدواء</label>
                        <select
                            value={selectedDrug}
                            onChange={(e) => setSelectedDrug(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                        >
                            <option value="">اختر الدواء...</option>
                            {drugs.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.tradeName}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-muted-foreground">الكمية</label>
                        <input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            min="1"
                            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-muted-foreground">الجرعة</label>
                        <input
                            type="text"
                            value={dosage}
                            onChange={(e) => setDosage(e.target.value)}
                            placeholder="مثال: 3 مرات يومياً"
                            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="col-span-2 md:col-span-3">
                        <label className="text-xs font-bold text-muted-foreground">التعليمات</label>
                        <input
                            type="text"
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            placeholder="مثال: بعد الأكل"
                            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            type="button"
                            onClick={addItem}
                            className="w-full flex items-center justify-center gap-2 bg-success hover:bg-success/90 text-success-foreground py-2 rounded-lg font-bold transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            إضافة
                        </button>
                    </div>
                </div>

                {/* قائمة الأدوية */}
                {items.length > 0 && (
                    <div className="mt-4 border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="px-3 py-2 text-right font-bold">الدواء</th>
                                    <th className="px-3 py-2 text-right font-bold">الكمية</th>
                                    <th className="px-3 py-2 text-right font-bold">الجرعة</th>
                                    <th className="px-3 py-2 text-right font-bold">حذف</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => (
                                    <tr key={idx} className="border-t">
                                        <td className="px-3 py-2 font-medium">{item.drugName}</td>
                                        <td className="px-3 py-2">{item.quantity}</td>
                                        <td className="px-3 py-2">{item.dosage || "-"}</td>
                                        <td className="px-3 py-2">
                                            <DeleteButton
                                                onConfirm={() => removeItem(idx)}
                                                description="الدواء من الوصفة"
                                                className="text-destructive hover:text-destructive border-none p-0 w-auto h-auto"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {items.length === 0 && (
                    <div className="mt-4 p-6 text-center text-muted-foreground border rounded-lg">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        لم يتم إضافة أدوية
                    </div>
                )}
            </div>

            {/* ملاحظات */}
            <div className="rounded-xl bg-card border border-border p-6 shadow-sm">
                <label htmlFor="notes" className="mb-2 block text-sm font-bold text-foreground">
                    ملاحظات
                </label>
                <textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    placeholder="أي ملاحظات إضافية..."
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
            </div>

            <input type="hidden" name="itemsData" value={JSON.stringify(items)} />

            {state.message && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
                    {state.message}
                </div>
            )}

            <div className="flex gap-4">
                <button
                    type="submit"
                    className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90"
                >
                    <FileText className="h-5 w-5" />
                    حفظ الوصفة
                </button>
                <Link
                    href="/dashboard/prescriptions"
                    className="flex items-center gap-2 rounded-lg bg-muted px-6 py-3 font-bold text-muted-foreground hover:bg-muted"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>

    );
}
