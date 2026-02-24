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
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-foreground">
                    اسم شركة التأمين
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="أدخل اسم الشركة"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    required
                />
                {state.errors?.name && (
                    <p className="mt-1 text-sm text-destructive">{state.errors.name}</p>
                )}
            </div>

            {/* نسبة الخصم */}
            <div>
                <label htmlFor="discountRate" className="mb-2 block text-sm font-bold text-foreground">
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
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
            </div>

            {/* الهاتف */}
            <div>
                <label htmlFor="contactPhone" className="mb-2 block text-sm font-bold text-foreground">
                    رقم الاتصال
                </label>
                <input
                    id="contactPhone"
                    name="contactPhone"
                    type="text"
                    placeholder="07xxxxxxxxx"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    dir="ltr"
                />
            </div>

            {/* البريد */}
            <div>
                <label htmlFor="contactEmail" className="mb-2 block text-sm font-bold text-foreground">
                    البريد الإلكتروني
                </label>
                <input
                    id="contactEmail"
                    name="contactEmail"
                    type="email"
                    placeholder="info@company.com"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    dir="ltr"
                />
            </div>

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
                    <Building2 className="h-5 w-5" />
                    حفظ الشركة
                </button>
                <Link
                    href="/dashboard/insurance"
                    className="flex items-center gap-2 rounded-lg bg-muted px-6 py-3 font-bold text-muted-foreground transition-colors hover:bg-muted"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
