"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteInventory } from "@/app/lib/actions/inventory";

export function UpdateInventory({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/inventory/${id}/edit`}
            className="rounded-lg border border-gray-200 p-2 hover:bg-gray-100 transition-colors"
            title="تعديل"
        >
            <Pencil className="w-4 h-4 text-gray-600" />
        </Link>
    );
}

export function DeleteInventory({ id }: { id: string }) {
    const handleDelete = async () => {
        if (confirm("هل أنت متأكد من حذف هذا المخزون؟ سيتم حذف جميع الدفعات المرتبطة.")) {
            await deleteInventory(id);
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
