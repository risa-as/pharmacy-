import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteOrganization } from "@/app/lib/actions/organization";

export function UpdateOrganization({ id }: { id: string }) {
    return (
        <Link
            href={`/dashboard/organizations/${id}/edit`}
            className="rounded-md border p-2 hover:bg-gray-100 transition-colors hover:text-blue-600"
        >
            <Pencil className="w-5" />
        </Link>
    );
}

export function DeleteOrganization({ id }: { id: string }) {
    const deleteOrganizationWithId = deleteOrganization.bind(null, id);

    return (
        <form action={deleteOrganizationWithId}>
            <button className="rounded-md border p-2 hover:bg-red-50 transition-colors hover:text-red-600">
                <Trash2 className="w-5" />
            </button>
        </form>
    );
}
