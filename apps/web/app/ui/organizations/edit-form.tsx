"use client";

import Link from "next/link";
import { SubmitButton } from "@/app/ui/submit-button";
import { useFormState } from "react-dom";
import { updateOrganization } from "@/app/lib/actions/organization";
interface Organization { id: string; name: string; }

export default function EditForm({ organization }: { organization: Organization }) {
    const initialState: any = { message: "", errors: {} };
    const updateOrganizationWithId = updateOrganization.bind(null, organization.id);
    const [state, dispatch] = useFormState(updateOrganizationWithId as any, initialState);

    return (
        <form action={dispatch} className="font-cairo">
            <div className="rounded-xl bg-muted p-4 md:p-6 border border-border">
                <div className="mb-4">
                    <label htmlFor="name" className="mb-2 block text-sm font-medium text-foreground">
                        اسم المنظمة
                    </label>
                    <div className="relative mt-2 rounded-md shadow-sm">
                        <input
                            id="name"
                            name="name"
                            type="text"
                            defaultValue={organization.name}
                            placeholder="أدخل اسم المنظمة"
                            className="peer block w-full rounded-md border border-border py-2 pr-10 pl-2 text-sm outline-2 placeholder:text-muted-foreground focus:border-ring focus:ring-ring"
                            aria-describedby="name-error"
                        />
                    </div>
                    <div id="name-error" aria-live="polite" aria-atomic="true">
                        {state.errors?.name &&
                            state.errors.name.map((error: string) => (
                                <p key={error} className="mt-2 text-sm text-destructive">
                                    {error}
                                </p>
                            ))}
                    </div>
                </div>
            </div>
            <div className="mt-6 flex justify-end gap-4">
                <Link
                    href="/dashboard/organizations"
                    className="flex h-10 items-center rounded-lg bg-muted px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                    إلغاء
                </Link>
                <SubmitButton text="حفظ التغييرات" />
            </div>
        </form>
    );
}
