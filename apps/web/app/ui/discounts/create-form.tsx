"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { createDiscount } from "@/app/lib/actions/discount";
import { Tag, ArrowRight, Percent, Calendar } from "lucide-react";

export default function CreateDiscountForm() {
    const initialState: any = { message: "", errors: {} };
    const [state, dispatch] = useFormState(createDiscount, initialState);
    const [mounted, setMounted] = useState(false);
    const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="animate-pulse h-96 bg-gray-100 rounded-xl" />;
    }

    // Default dates (today and 30 days later)
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    return (
        <form action={dispatch} className="space-y-6" suppressHydrationWarning>
            {/* اسم العرض */}
            <div>
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-gray-700">
                    اسم العرض
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="مثال: خصم الصيف"
                    required
                />
                {state.errors?.name && (
                    <p className="mt-1 text-sm text-red-500">{state.errors.name}</p>
                )}
            </div>

            {/* كود الخصم */}
            <div>
                <label htmlFor="code" className="mb-2 block text-sm font-bold text-gray-700">
                    كود الخصم (اختياري)
                </label>
                <input
                    id="code"
                    name="code"
                    type="text"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                    placeholder="SUMMER2024"
                    dir="ltr"
                />
                <p className="mt-1 text-xs text-gray-500">
                    كود يمكن للعميل إدخاله للحصول على الخصم
                </p>
            </div>

            {/* نوع الخصم */}
            <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">
                    نوع الخصم
                </label>
                <div className="grid grid-cols-2 gap-4">
                    <label className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${discountType === "PERCENTAGE"
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}>
                        <input
                            type="radio"
                            name="type"
                            value="PERCENTAGE"
                            checked={discountType === "PERCENTAGE"}
                            onChange={() => setDiscountType("PERCENTAGE")}
                            className="sr-only"
                        />
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${discountType === "PERCENTAGE" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"
                            }`}>
                            <Percent className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="font-bold text-gray-800">نسبة مئوية</div>
                            <div className="text-xs text-gray-500">خصم 10%، 20%...</div>
                        </div>
                    </label>

                    <label className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${discountType === "FIXED"
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}>
                        <input
                            type="radio"
                            name="type"
                            value="FIXED"
                            checked={discountType === "FIXED"}
                            onChange={() => setDiscountType("FIXED")}
                            className="sr-only"
                        />
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${discountType === "FIXED" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"
                            }`}>
                            <Tag className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="font-bold text-gray-800">مبلغ ثابت</div>
                            <div className="text-xs text-gray-500">خصم 5، 10...</div>
                        </div>
                    </label>
                </div>
            </div>

            {/* قيمة الخصم */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="value" className="mb-2 block text-sm font-bold text-gray-700">
                        قيمة الخصم {discountType === "PERCENTAGE" ? "(%)" : ""}
                    </label>
                    <input
                        id="value"
                        name="value"
                        type="number"
                        step="0.01"
                        min="0"
                        max={discountType === "PERCENTAGE" ? "100" : undefined}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder={discountType === "PERCENTAGE" ? "10" : "5.00"}
                        required
                    />
                    {state.errors?.value && (
                        <p className="mt-1 text-sm text-red-500">{state.errors.value}</p>
                    )}
                </div>
                <div>
                    <label htmlFor="minPurchase" className="mb-2 block text-sm font-bold text-gray-700">
                        الحد الأدنى للشراء
                    </label>
                    <input
                        id="minPurchase"
                        name="minPurchase"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue="0"
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                </div>
            </div>

            {/* تواريخ الصلاحية */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="startDate" className="mb-2 block text-sm font-bold text-gray-700">
                        تاريخ البداية
                    </label>
                    <input
                        id="startDate"
                        name="startDate"
                        type="date"
                        defaultValue={today}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        required
                    />
                </div>
                <div>
                    <label htmlFor="endDate" className="mb-2 block text-sm font-bold text-gray-700">
                        تاريخ الانتهاء
                    </label>
                    <input
                        id="endDate"
                        name="endDate"
                        type="date"
                        defaultValue={thirtyDaysLater}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        required
                    />
                </div>
            </div>

            {/* خيارات إضافية */}
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        name="isActive"
                        defaultChecked
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-700">تفعيل العرض فوراً</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        name="applyToAll"
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-700">تطبيق على جميع المنتجات</span>
                </label>
            </div>

            {/* رسالة الخطأ */}
            {state.message && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">
                    {state.message}
                </div>
            )}

            {/* الأزرار */}
            <div className="flex gap-4">
                <button
                    type="submit"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-bold text-white transition-colors hover:bg-blue-700"
                >
                    <Tag className="h-5 w-5" />
                    إنشاء العرض
                </button>
                <Link
                    href="/dashboard/discounts"
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-6 py-3 font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
