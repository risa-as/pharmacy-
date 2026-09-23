"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteSupplier } from "@/app/lib/actions/supplier";

export function UpdateSupplier({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/suppliers/${id}/edit`}
            className="rounded-lg border border-border p-2 hover:bg-muted transition-colors"
            title="تعديل"
        >
            <Pencil className="w-4 h-4 text-muted-foreground" />
        </Link>
    );
}

import { DeleteButton } from "@/app/ui/delete-button";

export function DeleteSupplier({ id, label }: { id: string; label?: string }) {
    const deleteSupplierWithId = deleteSupplier.bind(null, id);

    return (
        <DeleteButton
            action={deleteSupplierWithId}
            description="المورد"
            label={label}
            className="inline-flex items-center gap-2 rounded-lg border border-border text-xs hover:border-border"
        />
    );
}

