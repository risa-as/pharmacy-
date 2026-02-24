"use client";

import Link from "next/link";
import { Pencil, XCircle } from "lucide-react";
import { deletePrescription, cancelPrescription } from "@/app/lib/actions/prescription";

export function UpdatePrescription({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/prescriptions/${id}/edit`}
            className="rounded-lg border border-border p-2 hover:bg-muted transition-colors"
            title="تعديل"
        >
            <Pencil className="w-4 h-4 text-muted-foreground" />
        </Link>
    );
}

import { DeleteButton } from "@/app/ui/delete-button";

export function DeletePrescription({ id }: { id: string }) {
    const deletePrescriptionWithId = async (formData: FormData) => {
        await deletePrescription(id);
    };

    return (
        <DeleteButton
            action={deletePrescriptionWithId}
            description="الوصفة"
            className="rounded-lg border border-border hover:border-border"
        />
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
            className="rounded-lg border border-border p-2 hover:bg-warning/10 hover:border-warning/30 transition-colors"
            title="إلغاء"
        >
            <XCircle className="w-4 h-4 text-warning" />
        </button>
    );
}
