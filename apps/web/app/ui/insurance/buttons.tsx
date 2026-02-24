"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteInsuranceCompany } from "@/app/lib/actions/insurance";

export function UpdateInsurance({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/insurance/${id}/edit`}
            className="rounded-lg border border-border p-2 hover:bg-muted transition-colors"
            title="تعديل"
        >
            <Pencil className="w-4 h-4 text-muted-foreground" />
        </Link>
    );
}

import { DeleteButton } from "@/app/ui/delete-button";

export function DeleteInsurance({ id }: { id: string }) {
    const deleteInsuranceWithId = async (formData: FormData) => {
        await deleteInsuranceCompany(id);
    };

    return (
        <DeleteButton
            action={deleteInsuranceWithId}
            description="الشركة"
            className="rounded-lg border border-border hover:border-border"
        />
    );
}
