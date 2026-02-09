"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { createPatient } from "@/app/lib/actions/patient";
import { Users, ArrowRight } from "lucide-react";

export default function CreatePatientForm() {
    const initialState: any = { message: "", errors: {} };
    const [state, dispatch] = useFormState(createPatient, initialState);

    return (
        <form action={dispatch} className="space-y-6">
            {/* الاسم */}
            <div>
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-gray-700">
                    اسم المريض
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="أدخل اسم المريض"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                />
                {state.errors?.name && (
                    <p className="mt-1 text-sm text-red-500">{state.errors.name}</p>
                )}
            </div>

            {/* الهاتف */}
            <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-bold text-gray-700">
                    رقم الهاتف
                </label>
                <input
                    id="phone"
                    name="phone"
                    type="text"
                    placeholder="07xxxxxxxxx"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    dir="ltr"
                    required
                />
                {state.errors?.phone && (
                    <p className="mt-1 text-sm text-red-500">{state.errors.phone}</p>
                )}
            </div>

            {/* تاريخ الميلاد والجنس */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="dateOfBirth" className="mb-2 block text-sm font-bold text-gray-700">
                        تاريخ الميلاد
                    </label>
                    <input
                        id="dateOfBirth"
                        name="dateOfBirth"
                        type="date"
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                </div>
                <div>
                    <label htmlFor="gender" className="mb-2 block text-sm font-bold text-gray-700">
                        الجنس
                    </label>
                    <select
                        id="gender"
                        name="gender"
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                        <option value="">اختر...</option>
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                    </select>
                </div>
            </div>

            {/* الحساسية */}
            <div>
                <label htmlFor="allergies" className="mb-2 block text-sm font-bold text-gray-700">
                    الحساسية (افصل بين الأنواع بفاصلة)
                </label>
                <input
                    id="allergies"
                    name="allergies"
                    type="text"
                    placeholder="مثال: بنسلين, أسبرين"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
            </div>

            {/* الأمراض المزمنة */}
            <div>
                <label htmlFor="chronicDiseases" className="mb-2 block text-sm font-bold text-gray-700">
                    الأمراض المزمنة (افصل بين الأمراض بفاصلة)
                </label>
                <input
                    id="chronicDiseases"
                    name="chronicDiseases"
                    type="text"
                    placeholder="مثال: سكري, ضغط"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
            </div>

            {/* ملاحظات */}
            <div>
                <label htmlFor="notes" className="mb-2 block text-sm font-bold text-gray-700">
                    ملاحظات
                </label>
                <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    placeholder="أي ملاحظات إضافية..."
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                    <Users className="h-5 w-5" />
                    حفظ المريض
                </button>
                <Link
                    href="/dashboard/patients"
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-6 py-3 font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
