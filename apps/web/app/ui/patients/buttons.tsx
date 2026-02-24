"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { deletePatient } from "@/app/lib/actions/patient";

export function UpdatePatient({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/patients/${id}/edit`}
            className="rounded-lg border border-border p-2 hover:bg-muted transition-colors"
            title="تعديل"
        >
            <Pencil className="w-4 h-4 text-muted-foreground" />
        </Link>
    );
}

import { DeleteButton } from "@/app/ui/delete-button";

export function DeletePatient({ id }: { id: string }) {
    const deletePatientWithId = async (formData: FormData) => {
        return await deletePatient(id);
    };

    return (
        <DeleteButton
            action={deletePatientWithId}
            description="المريض"
            className="rounded-lg border border-border hover:border-border"
        />
    );
}
