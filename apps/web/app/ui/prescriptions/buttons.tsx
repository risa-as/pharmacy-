"use client";

import Link from "next/link";
import { Pencil, XCircle, CheckCircle } from "lucide-react";
import { deletePrescription, cancelPrescription, dispensePrescription } from "@/app/lib/actions/prescription";

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

export function DispensePrescription({ id, itemIds }: { id: string; itemIds: string[] }) {
    const handleDispense = async () => {
        if (confirm("هل تريد صرف جميع أدوية هذه الوصفة؟")) {
            await dispensePrescription(id, itemIds);
        }
    };

    return (
        <button
            onClick={handleDispense}
            className="rounded-lg border border-border p-2 hover:bg-success/10 hover:border-success/30 transition-colors"
            title="صرف الوصفة"
        >
            <CheckCircle className="w-4 h-4 text-success" />
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
            className="rounded-lg border border-border p-2 hover:bg-warning/10 hover:border-warning/30 transition-colors"
            title="إلغاء"
        >
            <XCircle className="w-4 h-4 text-warning" />
        </button>
    );
}
