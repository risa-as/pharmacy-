"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { deletePurchase } from "@/app/lib/actions/invoice";
import { DeleteButton } from "@/app/ui/delete-button";

export function ViewInvoice({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/purchases/${id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
            <Eye className="h-4 w-4" />
            تفاصيل
        </Link>
    );
}

export function DeleteInvoice({ id }: { id: string }) {
    const deleteInvoiceWithId = async (formData: FormData) => {
        await deletePurchase(id);
    };

    return (
        <DeleteButton
            action={deleteInvoiceWithId}
            description="الفاتورة"
            className="rounded-lg border border-border hover:border-border"
        />
    );
}
