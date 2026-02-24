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
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-foreground">
                    اسم المورد
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="أدخل اسم المورد"
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
                    placeholder="example@mail.com"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    dir="ltr"
                />
                {state.errors?.email && (
                    <p className="mt-1 text-sm text-destructive">{state.errors.email}</p>
                )}
            </div>

            {/* رقم الهاتف */}
            <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-bold text-foreground">
                    رقم الهاتف
                </label>
                <input
                    id="phone"
                    name="phone"
                    type="text"
                    placeholder="07xxxxxxxxx"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
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
                    placeholder="أدخل عنوان المورد"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
            </div>

            {/* رسالة الخطأ */}
            {state.message && (
                <div className="rounded-lg bg-destructive/10 border border-red-200 p-4 text-sm text-destructive">
                    {state.message}
                </div>
            )}

            {/* الأزرار */}
            <div className="flex gap-4">
                <button
                    type="submit"
                    className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary/90"
                >
                    <Users className="h-5 w-5" />
                    إضافة المورد
                </button>
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
