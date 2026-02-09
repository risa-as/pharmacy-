"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { updatePrescription } from "@/app/lib/actions/prescription";
import { FileText, ArrowRight } from "lucide-react";

interface Patient {
    id: string;
    name: string;
    phone: string;
}

interface Prescription {
    id: string;
    patientId: string;
    doctorName: string | null;
    clinicName: string | null;
    notes: string | null;
    patient: Patient;
}

export default function EditForm({
    prescription,
    patients
}: {
    prescription: Prescription;
    patients: Patient[];
}) {
    const initialState: any = { message: "", errors: {} };
    const updatePrescriptionWithId = updatePrescription.bind(null, prescription.id);
    const [state, dispatch] = useFormState(updatePrescriptionWithId, initialState);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="animate-pulse h-96 bg-gray-100 rounded-xl" />;
    }

    return (
        <form action={dispatch} className="space-y-6" suppressHydrationWarning>
            {/* المريض */}
            <div>
                <label htmlFor="patientId" className="mb-2 block text-sm font-bold text-gray-700">
                    المريض
                </label>
                <select
                    id="patientId"
                    name="patientId"
                    defaultValue={prescription.patientId}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                >
                    {patients.map((patient) => (
                        <option key={patient.id} value={patient.id}>
                            {patient.name} - {patient.phone}
                        </option>
                    ))}
                </select>
                {state.errors?.patientId && (
                    <p className="mt-1 text-sm text-red-500">{state.errors.patientId}</p>
                )}
            </div>

            {/* اسم الطبيب */}
            <div>
                <label htmlFor="doctorName" className="mb-2 block text-sm font-bold text-gray-700">
                    اسم الطبيب
                </label>
                <input
                    id="doctorName"
                    name="doctorName"
                    type="text"
                    defaultValue={prescription.doctorName || ""}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="د. أحمد..."
                />
            </div>

            {/* اسم العيادة */}
            <div>
                <label htmlFor="clinicName" className="mb-2 block text-sm font-bold text-gray-700">
                    اسم العيادة / المستشفى
                </label>
                <input
                    id="clinicName"
                    name="clinicName"
                    type="text"
                    defaultValue={prescription.clinicName || ""}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="عيادة..."
                />
            </div>

            {/* ملاحظات */}
            <div>
                <label htmlFor="notes" className="mb-2 block text-sm font-bold text-gray-700">
                    ملاحظات
                </label>
                <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    defaultValue={prescription.notes || ""}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="أي ملاحظات إضافية..."
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
                    <FileText className="h-5 w-5" />
                    حفظ التغييرات
                </button>
                <Link
                    href="/dashboard/prescriptions"
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-6 py-3 font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
