"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { updatePatient } from "@/app/lib/actions/patient";
import { Users, ArrowRight } from "lucide-react";
import { SubmitButton } from "@/app/ui/submit-button";

interface Patient {
    id: string;
    name: string;
    phone: string;
    dateOfBirth: Date | null;
    gender: string | null;
    allergies: string[];
    chronicDiseases: string[];
    notes: string | null;
}

export default function EditForm({ patient }: { patient: Patient }) {
    const initialState: any = { message: "", errors: {} };
    const updatePatientWithId = updatePatient.bind(null, patient.id);
    const [state, dispatch] = useFormState(updatePatientWithId, initialState);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="animate-pulse h-96 bg-muted rounded-xl" />;
    }

    return (
        <form action={dispatch} className="space-y-6" suppressHydrationWarning>
            {/* الاسم */}
            <div>
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-foreground">
                    اسم المريض
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    defaultValue={patient.name}
                    className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
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
                    defaultValue={patient.phone}
                    className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
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
                        defaultValue={patient.dateOfBirth ? new Date(patient.dateOfBirth).toISOString().split('T')[0] : ""}
                        className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
                    />
                </div>
                <div>
                    <label htmlFor="gender" className="mb-2 block text-sm font-bold text-foreground">
                        الجنس
                    </label>
                    <select
                        id="gender"
                        name="gender"
                        defaultValue={patient.gender || ""}
                        className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
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
                    defaultValue={patient.allergies.join(", ")}
                    className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
                    placeholder="مثال: بنسلين, أسبرين"
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
                    defaultValue={patient.chronicDiseases.join(", ")}
                    className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
                    placeholder="مثال: سكري, ضغط"
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
                    defaultValue={patient.notes || ""}
                    className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
                    placeholder="أي ملاحظات إضافية..."
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
                <SubmitButton text="حفظ التغييرات" icon={Users} />
                <Link
                    href="/dashboard/patients"
                    className="flex items-center gap-2 rounded-lg bg-muted px-6 py-3 font-bold text-muted-foreground transition-colors hover:bg-muted"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
