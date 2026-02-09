"use client";

import { Trash2 } from "lucide-react";
import { deletePurchase } from "@/app/lib/actions/invoice";

export function DeleteInvoice({ id }: { id: string }) {
    const handleDelete = async () => {
        if (confirm("هل أنت متأكد من حذف هذه الفاتورة؟ سيتم حذف جميع العناصر المرتبطة بها.")) {
            await deletePurchase(id);
        }
    };

    return (
        <button
            onClick={handleDelete}
            className="rounded-lg border border-gray-200 p-2 hover:bg-red-50 hover:border-red-200 transition-colors"
            title="حذف"
        >
            <Trash2 className="w-4 h-4 text-red-500" />
        </button>
    );
}
