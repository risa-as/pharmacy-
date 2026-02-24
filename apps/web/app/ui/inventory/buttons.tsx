"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteInventory } from "@/app/lib/actions/inventory";

export function UpdateInventory({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/inventory/${id}/edit`}
            className="rounded-lg border border-border p-2 hover:bg-muted transition-colors"
            title="تعديل"
        >
            <Pencil className="w-4 h-4 text-muted-foreground" />
        </Link>
    );
}

import { DeleteButton } from "@/app/ui/delete-button";

export function DeleteInventory({ id }: { id: string }) {
    const deleteInventoryWithId = async (formData: FormData) => {
        await deleteInventory(id);
    };

    return (
        <DeleteButton
            action={deleteInventoryWithId}
            description="المخزون"
            className="rounded-lg border border-border hover:border-border"
        />
    );
}
