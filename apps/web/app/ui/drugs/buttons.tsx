import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteDrug } from "@/app/lib/actions/drug";

export function UpdateDrug({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/drugs/${id}/edit`}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
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
        <form>
            <DeleteButton action={deleteDrugWithId} description="الدواء" className="rounded-lg border-border p-1.5 text-muted-foreground hover:border-destructive/50" />
        </form>
    );
}
