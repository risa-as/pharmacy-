import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteDrug } from "@/app/lib/actions/drug";

export function UpdateDrug({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/drugs/${id}/edit`}
            className="rounded-md border p-2 hover:bg-gray-100 transition-colors hover:text-blue-600"
            title="تعديل"
        >
            <Pencil className="w-4 h-4" />
        </Link>
    );
}

export function DeleteDrug({ id }: { id: string }) {
    const deleteDrugWithId = deleteDrug.bind(null, id);

    return (
        <form action={deleteDrugWithId}>
            <button
                className="rounded-md border p-2 hover:bg-red-50 transition-colors hover:text-red-600"
                title="حذف"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </form>
    );
}
