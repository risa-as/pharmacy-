"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { createSupplier } from "@/app/lib/actions/supplier";
import { Users, ArrowRight } from "lucide-react";

export default function Form() {
    const initialState: any = { message: "", errors: {} };
    const [state, dispatch] = useFormState(createSupplier, initialState);

    return (
        <form action={dispatch} className="space-y-6">
            {/* اسم المورد */}
            <div>
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-gray-700">
                    اسم المورد
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="أدخل اسم المورد"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                />
                {state.errors?.name && (
                    <p className="mt-1 text-sm text-red-500">{state.errors.name}</p>
                )}
            </div>

            {/* البريد الإلكتروني */}
            <div>
                <label htmlFor="email" className="mb-2 block text-sm font-bold text-gray-700">
                    البريد الإلكتروني
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="example@mail.com"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    dir="ltr"
                />
                {state.errors?.email && (
                    <p className="mt-1 text-sm text-red-500">{state.errors.email}</p>
                )}
            </div>

            {/* رقم الهاتف */}
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
                />
            </div>

            {/* العنوان */}
            <div>
                <label htmlFor="address" className="mb-2 block text-sm font-bold text-gray-700">
                    العنوان
                </label>
                <input
                    id="address"
                    name="address"
                    type="text"
                    placeholder="أدخل عنوان المورد"
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
                    إضافة المورد
                </button>
                <Link
                    href="/dashboard/suppliers"
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-6 py-3 font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
