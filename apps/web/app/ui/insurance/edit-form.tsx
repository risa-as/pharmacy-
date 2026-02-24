"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { updateInsuranceCompany } from "@/app/lib/actions/insurance";
import { Building2, ArrowRight } from "lucide-react";
import { SubmitButton } from "@/app/ui/submit-button";

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
        return <div className="animate-pulse h-96 bg-muted rounded-xl" />;
    }

    return (
        <form action={dispatch} className="space-y-6" suppressHydrationWarning>
            {/* اسم الشركة */}
            <div>
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-foreground">
                    اسم الشركة
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    defaultValue={company.name}
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
                    defaultValue={company.discountRate}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    required
                />
            </div>

            {/* الهاتف */}
            <div>
                <label htmlFor="contactPhone" className="mb-2 block text-sm font-bold text-foreground">
                    رقم الهاتف
                </label>
                <input
                    id="contactPhone"
                    name="contactPhone"
                    type="text"
                    defaultValue={company.contactPhone || ""}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    dir="ltr"
                />
            </div>

            {/* البريد الإلكتروني */}
            <div>
                <label htmlFor="contactEmail" className="mb-2 block text-sm font-bold text-foreground">
                    البريد الإلكتروني
                </label>
                <input
                    id="contactEmail"
                    name="contactEmail"
                    type="email"
                    defaultValue={company.contactEmail || ""}
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
                <SubmitButton text="حفظ التغييرات" icon={Building2} />
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
