import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteUser } from "@/app/lib/actions/user";

export function UpdateUser({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/users/${id}/edit`}
            className="rounded-md border p-2 hover:bg-gray-100 transition-colors hover:text-blue-600"
            title="تعديل"
        >
            <Pencil className="w-4 h-4" />
        </Link>
    );
}

export function DeleteUser({ id }: { id: string }) {
    const deleteUserWithId = deleteUser.bind(null, id);

    return (
        <form action={deleteUserWithId}>
            <button
                className="rounded-md border p-2 hover:bg-red-50 transition-colors hover:text-red-600"
                title="حذف"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </form>
    );
}
