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

export function DeleteSupplier({ id }: { id: string }) {
    const deleteSupplierWithId = deleteSupplier.bind(null, id);

    return (
        <DeleteButton
            action={deleteSupplierWithId}
            description="المورد"
            className="rounded-lg border border-border hover:border-border"
        />
    );
}

