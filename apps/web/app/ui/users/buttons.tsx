import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteUser } from "@/app/lib/actions/user";

export function UpdateUser({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/users/${id}/edit`}
            className="rounded-md border p-2 hover:bg-muted transition-colors hover:text-primary"
            title="تعديل"
        >
            <Pencil className="w-4 h-4" />
        </Link>
    );
}

import { DeleteButton } from "@/app/ui/delete-button";

export function DeleteUser({ id }: { id: string }) {
    const deleteUserWithId = deleteUser.bind(null, id);

    return (
        <form action={deleteUserWithId}>
            <DeleteButton action={deleteUserWithId} description="المستخدم" />
        </form>
    );
}
