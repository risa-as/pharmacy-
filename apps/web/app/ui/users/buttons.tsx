import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteUser } from "@/app/lib/actions/user";

export function UpdateUser({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/users/${id}/edit`}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
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
        <form>
            <DeleteButton action={deleteUserWithId} description="المستخدم" className="rounded-lg border-border p-1.5 text-muted-foreground hover:border-destructive/50" />
        </form>
    );
}
