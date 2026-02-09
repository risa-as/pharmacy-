"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { createPrescription } from "@/app/lib/actions/prescription";
import { FileText, Plus, Trash2, ArrowRight } from "lucide-react";

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

        setItems([
            ...items,
            {
                drugId: selectedDrug,
                drugName: drug?.tradeName,
                quantity,
                dosage,
                instructions,
            },
        ]);

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
                <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm h-48 animate-pulse" />
                <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm h-64 animate-pulse" />
            </div>
        );
    }

    return (
        <form action={dispatch} className="space-y-6" suppressHydrationWarning>
            {/* معلومات الوصفة */}
            <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4">معلومات الوصفة</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="patientId" className="mb-2 block text-sm font-bold text-gray-700">
                            المريض
                        </label>
                        <select
                            id="patientId"
                            name="patientId"
                            className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                        <label htmlFor="doctorName" className="mb-2 block text-sm font-bold text-gray-700">
                            اسم الطبيب
                        </label>
                        <input
                            id="doctorName"
                            name="doctorName"
                            type="text"
                            placeholder="اختياري"
                            className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="clinicName" className="mb-2 block text-sm font-bold text-gray-700">
                            العيادة / المستشفى
                        </label>
                        <input
                            id="clinicName"
                            name="clinicName"
                            type="text"
                            placeholder="اختياري"
                            className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                    </div>
                </div>
            </div>

            {/* إضافة أدوية */}
            <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4">الأدوية</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="col-span-2">
                        <label className="text-xs font-bold text-gray-600">الدواء</label>
                        <select
                            value={selectedDrug}
                            onChange={(e) => setSelectedDrug(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                        <label className="text-xs font-bold text-gray-600">الكمية</label>
                        <input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            min="1"
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-600">الجرعة</label>
                        <input
                            type="text"
                            value={dosage}
                            onChange={(e) => setDosage(e.target.value)}
                            placeholder="مثال: 3 مرات يومياً"
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="col-span-2 md:col-span-3">
                        <label className="text-xs font-bold text-gray-600">التعليمات</label>
                        <input
                            type="text"
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            placeholder="مثال: بعد الأكل"
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            type="button"
                            onClick={addItem}
                            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold"
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
                            <thead className="bg-gray-50">
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
                                            <button
                                                type="button"
                                                onClick={() => removeItem(idx)}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {items.length === 0 && (
                    <div className="mt-4 p-6 text-center text-gray-400 border rounded-lg">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        لم يتم إضافة أدوية
                    </div>
                )}
            </div>

            {/* ملاحظات */}
            <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
                <label htmlFor="notes" className="mb-2 block text-sm font-bold text-gray-700">
                    ملاحظات
                </label>
                <textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    placeholder="أي ملاحظات إضافية..."
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
            </div>

            <input type="hidden" name="itemsData" value={JSON.stringify(items)} />

            {state.message && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">
                    {state.message}
                </div>
            )}

            <div className="flex gap-4">
                <button
                    type="submit"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700"
                >
                    <FileText className="h-5 w-5" />
                    حفظ الوصفة
                </button>
                <Link
                    href="/dashboard/prescriptions"
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-6 py-3 font-bold text-gray-600 hover:bg-gray-200"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
