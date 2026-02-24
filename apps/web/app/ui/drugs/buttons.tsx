import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteDrug } from "@/app/lib/actions/drug";

export function UpdateDrug({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/drugs/${id}/edit`}
            className="rounded-md border p-2 hover:bg-muted transition-colors hover:text-primary"
            title="تعديل"
        >
            <Pencil className="w-4 h-4" />
        </Link>
    );
}

import { DeleteButton } from "@/app/ui/delete-button";

export function DeleteDrug({ id }: { id: string }) {
    const deleteDrugWithId = deleteDrug.bind(null, id);

    return (
        <form action={deleteDrugWithId}>
            <DeleteButton action={deleteDrugWithId} description="الدواء" />
        </form>
    );
}
