"use client";

import Link from "next/link";
import { Button } from "@faramace/ui";
import { useFormState } from "react-dom";
import { updateBranch } from "@/app/lib/actions/branch";

interface Organization {
    id: string;
    name: string;
}

interface Branch {
    id: string;
    name: string;
    organizationId: string;
}

export default function EditForm({
    branch,
    organizations
}: {
    branch: Branch;
    organizations: Organization[];
}) {
    const initialState: any = { message: "", errors: {} };
    const updateBranchWithId = updateBranch.bind(null, branch.id);
    const [state, dispatch] = useFormState(updateBranchWithId, initialState);

    return (
        <form action={dispatch}>
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-6">
                <div className="mb-6">
                    <label htmlFor="organizationId" className="mb-2 block text-sm font-medium text-gray-700">
                        المنظمة
                    </label>
                    <select
                        id="organizationId"
                        name="organizationId"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white"
                        defaultValue={branch.organizationId}
                        aria-describedby="organization-error"
                    >
                        <option value="" disabled>
                            اختر المنظمة
                        </option>
                        {organizations.map((org) => (
                            <option key={org.id} value={org.id}>
                                {org.name}
                            </option>
                        ))}
                    </select>
                    <div id="organization-error" aria-live="polite" aria-atomic="true">
                        {state.errors?.organizationId &&
                            state.errors.organizationId.map((error: string) => (
                                <p key={error} className="mt-2 text-sm text-red-500">
                                    {error}
                                </p>
                            ))}
                    </div>
                </div>

                <div className="mb-6">
                    <label htmlFor="name" className="mb-2 block text-sm font-medium text-gray-700">
                        اسم الفرع
                    </label>
                    <input
                        id="name"
                        name="name"
                        type="text"
                        defaultValue={branch.name}
                        placeholder="أدخل اسم الفرع"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        aria-describedby="name-error"
                    />
                    <div id="name-error" aria-live="polite" aria-atomic="true">
                        {state.errors?.name &&
                            state.errors.name.map((error: string) => (
                                <p key={error} className="mt-2 text-sm text-red-500">
                                    {error}
                                </p>
                            ))}
                    </div>
                </div>

                {state.message && (
                    <p className="mt-2 text-sm text-red-500">{state.message}</p>
                )}
            </div>
            <div className="mt-6 flex justify-end gap-4">
                <Link
                    href="/dashboard/branches"
                    className="flex h-10 items-center rounded-lg bg-gray-100 px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
                >
                    إلغاء
                </Link>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                    حفظ التعديلات
                </Button>
            </div>
        </form>
    );
}
