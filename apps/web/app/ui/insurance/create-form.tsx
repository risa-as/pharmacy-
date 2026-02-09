"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { createInsuranceCompany } from "@/app/lib/actions/insurance";
import { Building2, ArrowRight } from "lucide-react";

export default function CreateInsuranceForm() {
    const initialState: any = { message: "", errors: {} };
    const [state, dispatch] = useFormState(createInsuranceCompany, initialState);

    return (
        <form action={dispatch} className="space-y-6">
            {/* اسم الشركة */}
            <div>
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-gray-700">
                    اسم شركة التأمين
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="أدخل اسم الشركة"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                />
                {state.errors?.name && (
                    <p className="mt-1 text-sm text-red-500">{state.errors.name}</p>
                )}
            </div>

            {/* نسبة الخصم */}
            <div>
                <label htmlFor="discountRate" className="mb-2 block text-sm font-bold text-gray-700">
                    نسبة الخصم (%)
                </label>
                <input
                    id="discountRate"
                    name="discountRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    defaultValue="0"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
            </div>

            {/* الهاتف */}
            <div>
                <label htmlFor="contactPhone" className="mb-2 block text-sm font-bold text-gray-700">
                    رقم الاتصال
                </label>
                <input
                    id="contactPhone"
                    name="contactPhone"
                    type="text"
                    placeholder="07xxxxxxxxx"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    dir="ltr"
                />
            </div>

            {/* البريد */}
            <div>
                <label htmlFor="contactEmail" className="mb-2 block text-sm font-bold text-gray-700">
                    البريد الإلكتروني
                </label>
                <input
                    id="contactEmail"
                    name="contactEmail"
                    type="email"
                    placeholder="info@company.com"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    dir="ltr"
                />
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
                    <Building2 className="h-5 w-5" />
                    حفظ الشركة
                </button>
                <Link
                    href="/dashboard/insurance"
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-6 py-3 font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
