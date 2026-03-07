"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { createPatient } from "@/app/lib/actions/patient";
import { Users, ArrowRight } from "lucide-react";

import { useFormStatus } from "react-dom";

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className={`flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground transition-all duration-300 ${pending ? "opacity-70 cursor-not-allowed transform scale-95" : "hover:bg-primary/90 hover:scale-105 shadow-md hover:shadow-lg"
                }`}
        >
            {pending ? (
                <div className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></span>
                    جاري الحفظ...
                </div>
            ) : (
                <>
                    <Users className="h-5 w-5" />
                    حفظ المريض
                </>
            )}
        </button>
    );
}

export default function CreatePatientForm() {
    const initialState: any = { message: "", errors: {} };
    const [state, dispatch] = useFormState(createPatient, initialState);

    return (
        <form action={dispatch} className="space-y-6">
            {/* الاسم */}
            <div>
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-foreground">
                    اسم المريض
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="أدخل اسم المريض"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    required
                />
                {state.errors?.name && (
                    <p className="mt-1 text-sm text-destructive">{state.errors.name}</p>
                )}
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
                    placeholder="07xxxxxxxxx"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    dir="ltr"
                    required
                />
                {state.errors?.phone && (
                    <p className="mt-1 text-sm text-destructive">{state.errors.phone}</p>
                )}
            </div>

            {/* تاريخ الميلاد والجنس */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="dateOfBirth" className="mb-2 block text-sm font-bold text-foreground">
                        تاريخ الميلاد
                    </label>
                    <input
                        id="dateOfBirth"
                        name="dateOfBirth"
                        type="date"
                        className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                </div>
                <div>
                    <label htmlFor="gender" className="mb-2 block text-sm font-bold text-foreground">
                        الجنس
                    </label>
                    <select
                        id="gender"
                        name="gender"
                        className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    >
                        <option value="">اختر...</option>
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                    </select>
                </div>
            </div>

            {/* الحساسية */}
            <div>
                <label htmlFor="allergies" className="mb-2 block text-sm font-bold text-foreground">
                    الحساسية (افصل بين الأنواع بفاصلة)
                </label>
                <input
                    id="allergies"
                    name="allergies"
                    type="text"
                    placeholder="مثال: بنسلين, أسبرين"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
            </div>

            {/* الأمراض المزمنة */}
            <div>
                <label htmlFor="chronicDiseases" className="mb-2 block text-sm font-bold text-foreground">
                    الأمراض المزمنة (افصل بين الأمراض بفاصلة)
                </label>
                <input
                    id="chronicDiseases"
                    name="chronicDiseases"
                    type="text"
                    placeholder="مثال: سكري, ضغط"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
            </div>

            {/* ملاحظات */}
            <div>
                <label htmlFor="notes" className="mb-2 block text-sm font-bold text-foreground">
                    ملاحظات
                </label>
                <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    placeholder="أي ملاحظات إضافية..."
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
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
                <SubmitButton />
                <Link
                    href="/dashboard/patients"
                    className="flex items-center gap-2 rounded-lg bg-muted px-6 py-3 font-bold text-muted-foreground transition-all duration-300 hover:bg-muted/80 hover:scale-105"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
