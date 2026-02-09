import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteBranch } from "@/app/lib/actions/branch";

export function UpdateBranch({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/branches/${id}/edit`}
            className="rounded-md border p-2 hover:bg-gray-100 transition-colors hover:text-blue-600"
            title="تعديل"
        >
            <Pencil className="w-4 h-4" />
        </Link>
    );
}

export function DeleteBranch({ id }: { id: string }) {
    const deleteBranchWithId = deleteBranch.bind(null, id);

    return (
        <form action={deleteBranchWithId}>
            <button
                className="rounded-md border p-2 hover:bg-red-50 transition-colors hover:text-red-600"
                title="حذف"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </form>
    );
}
