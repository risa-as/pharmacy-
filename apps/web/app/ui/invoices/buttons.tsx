"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { deletePurchase } from "@/app/lib/actions/invoice";
import { DeleteButton } from "@/app/ui/delete-button";

export function ViewInvoice({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/purchases/${id}`}
            title="التفاصيل"
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
        >
            <Eye className="h-4 w-4" />
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
            className="rounded-lg border-border p-1.5 text-muted-foreground hover:border-destructive/50"
        />
    );
}
