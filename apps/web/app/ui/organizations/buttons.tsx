import Link from "next/link";
import { Pencil } from "lucide-react";
import { deleteOrganization } from "@/app/lib/actions/organization";

export function UpdateOrganization({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/organizations/${id}/edit`}
            className="flex h-9 w-9 items-center justify-center rounded-md border p-0 transition-colors hover:bg-muted hover:text-primary"
        >
            <Pencil className="w-4 h-4" />
        </Link>
    );
}

import { DeleteButton } from "@/app/ui/delete-button";

export function DeleteOrganization({ id }: { id: string }) {
    const deleteOrganizationWithId = deleteOrganization.bind(null, id);

    return (
        <form action={deleteOrganizationWithId}>
            <DeleteButton
                action={deleteOrganizationWithId}
                description="المنظمة"
                className="flex h-9 w-9 items-center justify-center rounded-md border p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            />
        </form>
    );
}
