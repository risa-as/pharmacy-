import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteBranch } from "@/app/lib/actions/branch";

export function UpdateBranch({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/branches/${id}/edit`}
            className="rounded-md border p-2 hover:bg-muted transition-colors hover:text-primary"
            title="تعديل"
        >
            <Pencil className="w-4 h-4" />
        </Link>
    );
}

import { DeleteButton } from "@/app/ui/delete-button";

export function DeleteBranch({ id }: { id: string }) {
    const deleteBranchWithId = deleteBranch.bind(null, id);

    return (
        <form action={deleteBranchWithId}>
            <DeleteButton action={deleteBranchWithId} description="الفرع" />
        </form>
    );
}
