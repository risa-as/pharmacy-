"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { updateSupplier } from "@/app/lib/actions/supplier";
import { Users, ArrowRight } from "lucide-react";
import { SubmitButton } from "@/app/ui/submit-button";

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
        return <div className="animate-pulse h-96 bg-muted rounded-xl" />;
    }

    return (
        <form action={dispatch} className="space-y-6" suppressHydrationWarning>
            {/* اسم المورد */}
            <div>
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-foreground">
                    اسم المورد
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    defaultValue={supplier.name}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    required
                />
                {state.errors?.name && (
                    <p className="mt-1 text-sm text-destructive">{state.errors.name}</p>
                )}
            </div>

            {/* البريد الإلكتروني */}
            <div>
                <label htmlFor="email" className="mb-2 block text-sm font-bold text-foreground">
                    البريد الإلكتروني
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={supplier.email || ""}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    placeholder="example@email.com"
                    dir="ltr"
                />
            </div>

            {/* الهاتف */}
            <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-bold text-foreground">
                    رقم الهاتف
                </label>
                <input
                    id="phone"
                    name="phone"
                    type="text"
                    defaultValue={supplier.phone || ""}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    placeholder="07xxxxxxxxx"
                    dir="ltr"
                />
            </div>

            {/* العنوان */}
            <div>
                <label htmlFor="address" className="mb-2 block text-sm font-bold text-foreground">
                    العنوان
                </label>
                <input
                    id="address"
                    name="address"
                    type="text"
                    defaultValue={supplier.address || ""}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    placeholder="أدخل العنوان"
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
                <SubmitButton text="حفظ التغييرات" icon={Users} />
                <Link
                    href="/dashboard/suppliers"
                    className="flex items-center gap-2 rounded-lg bg-muted px-6 py-3 font-bold text-muted-foreground transition-colors hover:bg-muted"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
