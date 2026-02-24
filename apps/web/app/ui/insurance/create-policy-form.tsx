"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { createInsurancePolicy } from "@/app/lib/actions/insurance";
import { Shield, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface Patient {
    id: string;
    name: string;
    phone: string;
}

interface InsuranceCompany {
    id: string;
    name: string;
}

export default function CreatePolicyForm({
    patients,
    companies
}: {
    patients: Patient[];
    companies: InsuranceCompany[];
}) {
    const initialState: any = { message: "", errors: {}, success: false };
    const [state, dispatch] = useFormState(createInsurancePolicy, initialState);
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (state.success) {
            router.push("/dashboard/insurance/policies");
        }
    }, [state.success, router]);

    if (!mounted) {
        return <div className="animate-pulse h-96 bg-muted rounded-xl" />;
    }

    return (
        <form action={dispatch} className="space-y-6" suppressHydrationWarning>
            {/* المريض */}
            <div>
                <label htmlFor="patientId" className="mb-2 block text-sm font-bold text-foreground">
                    المريض
                </label>
                <select
                    id="patientId"
                    name="patientId"
                    className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
                    required
                >
                    <option value="">اختر المريض...</option>
                    {patients.map((patient) => (
                        <option key={patient.id} value={patient.id}>
                            {patient.name} - {patient.phone}
                        </option>
                    ))}
                </select>
                {state.errors?.patientId && (
                    <p className="mt-1 text-sm text-destructive">{state.errors.patientId}</p>
                )}
            </div>

            {/* شركة التأمين */}
            <div>
                <label htmlFor="companyId" className="mb-2 block text-sm font-bold text-foreground">
                    شركة التأمين
                </label>
                <select
                    id="companyId"
                    name="companyId"
                    className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
                    required
                >
                    <option value="">اختر شركة التأمين...</option>
                    {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                            {company.name}
                        </option>
                    ))}
                </select>
                {state.errors?.companyId && (
                    <p className="mt-1 text-sm text-destructive">{state.errors.companyId}</p>
                )}
            </div>

            {/* رقم البوليصة */}
            <div>
                <label htmlFor="policyNumber" className="mb-2 block text-sm font-bold text-foreground">
                    رقم البوليصة
                </label>
                <input
                    id="policyNumber"
                    name="policyNumber"
                    type="text"
                    className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
                    placeholder="مثال: INS-2024-001"
                    required
                />
                {state.errors?.policyNumber && (
                    <p className="mt-1 text-sm text-destructive">{state.errors.policyNumber}</p>
                )}
            </div>

            {/* تاريخ الانتهاء ونسبة التغطية */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="expiryDate" className="mb-2 block text-sm font-bold text-foreground">
                        تاريخ الانتهاء
                    </label>
                    <input
                        id="expiryDate"
                        name="expiryDate"
                        type="date"
                        className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
                        required
                    />
                    {state.errors?.expiryDate && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.expiryDate}</p>
                    )}
                </div>
                <div>
                    <label htmlFor="coverageRate" className="mb-2 block text-sm font-bold text-foreground">
                        نسبة التغطية (%)
                    </label>
                    <input
                        id="coverageRate"
                        name="coverageRate"
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={80}
                        className="w-full rounded-lg border border-border px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-blue-100"
                        required
                    />
                </div>
            </div>

            {/* رسالة الخطأ */}
            {state.message && !state.success && (
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
                    <Shield className="h-5 w-5" />
                    إضافة البوليصة
                </button>
                <Link
                    href="/dashboard/insurance/policies"
                    className="flex items-center gap-2 rounded-lg bg-muted px-6 py-3 font-bold text-muted-foreground transition-colors hover:bg-muted"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
