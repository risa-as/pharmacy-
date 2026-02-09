"use client";

import Link from "next/link";
import { Pencil, Trash2, XCircle } from "lucide-react";
import { deletePrescription, cancelPrescription } from "@/app/lib/actions/prescription";

export function UpdatePrescription({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/prescriptions/${id}/edit`}
            className="rounded-lg border border-gray-200 p-2 hover:bg-gray-100 transition-colors"
            title="تعديل"
        >
            <Pencil className="w-4 h-4 text-gray-600" />
        </Link>
    );
}

export function DeletePrescription({ id }: { id: string }) {
    const handleDelete = async () => {
        if (confirm("هل أنت متأكد من حذف هذه الوصفة؟")) {
            await deletePrescription(id);
        }
    };

    return (
        <button
            onClick={handleDelete}
            className="rounded-lg border border-gray-200 p-2 hover:bg-red-50 hover:border-red-200 transition-colors"
            title="حذف"
        >
            <Trash2 className="w-4 h-4 text-red-500" />
        </button>
    );
}

export function CancelPrescription({ id }: { id: string }) {
    const handleCancel = async () => {
        if (confirm("هل أنت متأكد من إلغاء هذه الوصفة؟")) {
            await cancelPrescription(id);
        }
    };

    return (
        <button
            onClick={handleCancel}
            className="rounded-lg border border-gray-200 p-2 hover:bg-yellow-50 hover:border-yellow-200 transition-colors"
            title="إلغاء"
        >
            <XCircle className="w-4 h-4 text-yellow-600" />
        </button>
    );
}
