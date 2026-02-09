"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { updateInsuranceCompany } from "@/app/lib/actions/insurance";
import { Building2, ArrowRight } from "lucide-react";

interface InsuranceCompany {
    id: string;
    name: string;
    discountRate: number;
    contactPhone: string | null;
    contactEmail: string | null;
    isActive: boolean;
}

export default function EditForm({ company }: { company: InsuranceCompany }) {
    const initialState: any = { message: "", errors: {} };
    const updateInsuranceWithId = updateInsuranceCompany.bind(null, company.id);
    const [state, dispatch] = useFormState(updateInsuranceWithId, initialState);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="animate-pulse h-96 bg-gray-100 rounded-xl" />;
    }

    return (
        <form action={dispatch} className="space-y-6" suppressHydrationWarning>
            {/* اسم الشركة */}
            <div>
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-gray-700">
                    اسم الشركة
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    defaultValue={company.name}
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
                    defaultValue={company.discountRate}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                />
            </div>

            {/* الهاتف */}
            <div>
                <label htmlFor="contactPhone" className="mb-2 block text-sm font-bold text-gray-700">
                    رقم الهاتف
                </label>
                <input
                    id="contactPhone"
                    name="contactPhone"
                    type="text"
                    defaultValue={company.contactPhone || ""}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    dir="ltr"
                />
            </div>

            {/* البريد الإلكتروني */}
            <div>
                <label htmlFor="contactEmail" className="mb-2 block text-sm font-bold text-gray-700">
                    البريد الإلكتروني
                </label>
                <input
                    id="contactEmail"
                    name="contactEmail"
                    type="email"
                    defaultValue={company.contactEmail || ""}
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
                    حفظ التغييرات
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
