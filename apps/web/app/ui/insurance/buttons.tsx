"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteInsuranceCompany } from "@/app/lib/actions/insurance";

export function UpdateInsurance({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/insurance/${id}/edit`}
            className="rounded-lg border border-gray-200 p-2 hover:bg-gray-100 transition-colors"
            title="تعديل"
        >
            <Pencil className="w-4 h-4 text-gray-600" />
        </Link>
    );
}

export function DeleteInsurance({ id }: { id: string }) {
    const handleDelete = async () => {
        if (confirm("هل أنت متأكد من حذف هذه الشركة؟")) {
            await deleteInsuranceCompany(id);
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
