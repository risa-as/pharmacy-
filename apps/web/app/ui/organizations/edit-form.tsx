"use client";

import Link from "next/link";
import { Button } from "@faramace/ui";
import { useFormState } from "react-dom";
import { updateOrganization } from "@/app/lib/actions/organization";
import type { Organization } from "@prisma/client";

export default function EditForm({ organization }: { organization: Organization }) {
    const initialState: any = { message: "", errors: {} };
    const updateOrganizationWithId = updateOrganization.bind(null, organization.id);
    const [state, dispatch] = useFormState(updateOrganizationWithId as any, initialState);

    return (
        <form action={dispatch} className="font-cairo">
            <div className="rounded-xl bg-gray-50 p-4 md:p-6 border border-gray-100">
                <div className="mb-4">
                    <label htmlFor="name" className="mb-2 block text-sm font-medium text-gray-700">
                        اسم المنظمة
                    </label>
                    <div className="relative mt-2 rounded-md shadow-sm">
                        <input
                            id="name"
                            name="name"
                            type="text"
                            defaultValue={organization.name}
                            placeholder="أدخل اسم المنظمة"
                            className="peer block w-full rounded-md border border-gray-200 py-2 pr-10 pl-2 text-sm outline-2 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500"
                            aria-describedby="name-error"
                        />
                    </div>
                    <div id="name-error" aria-live="polite" aria-atomic="true">
                        {state.errors?.name &&
                            state.errors.name.map((error: string) => (
                                <p key={error} className="mt-2 text-sm text-red-500">
                                    {error}
                                </p>
                            ))}
                    </div>
                </div>
            </div>
            <div className="mt-6 flex justify-end gap-4">
                <Link
                    href="/dashboard/organizations"
                    className="flex h-10 items-center rounded-lg bg-gray-100 px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
                >
                    إلغاء
                </Link>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">حفظ التغييرات</Button>
            </div>
        </form>
    );
}
