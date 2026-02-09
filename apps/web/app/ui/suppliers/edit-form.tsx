"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { updateSupplier } from "@/app/lib/actions/supplier";
import { Users, ArrowRight } from "lucide-react";

interface Supplier {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
}

export default function EditForm({ supplier }: { supplier: Supplier }) {
    const initialState: any = { message: "", errors: {} };
    const updateSupplierWithId = updateSupplier.bind(null, supplier.id);
    const [state, dispatch] = useFormState(updateSupplierWithId, initialState);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="animate-pulse h-96 bg-gray-100 rounded-xl" />;
    }

    return (
        <form action={dispatch} className="space-y-6" suppressHydrationWarning>
            {/* اسم المورد */}
            <div>
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-gray-700">
                    اسم المورد
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    defaultValue={supplier.name}
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
                    defaultValue={supplier.email || ""}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="example@email.com"
                    dir="ltr"
                />
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
                    defaultValue={supplier.phone || ""}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="07xxxxxxxxx"
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
                    defaultValue={supplier.address || ""}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="أدخل العنوان"
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
                    حفظ التغييرات
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
