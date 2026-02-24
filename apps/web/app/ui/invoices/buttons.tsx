"use client";


import { deletePurchase } from "@/app/lib/actions/invoice";

import { DeleteButton } from "@/app/ui/delete-button";

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
