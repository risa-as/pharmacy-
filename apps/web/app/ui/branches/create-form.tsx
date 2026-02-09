"use client";

import Link from "next/link";
import { Button } from "@faramace/ui";
import { useFormState } from "react-dom";
import { createBranch } from "@/app/lib/actions/branch";

interface Organization {
  id: string;
  name: string;
}

export default function Form({ organizations }: { organizations: Organization[] }) {
  const initialState: any = { message: "", errors: {} };
  const [state, dispatch] = useFormState(createBranch, initialState);

  return (
    <form action={dispatch}>
      <div className="rounded-md bg-gray-50 p-4 md:p-6">
        <div className="mb-4">
          <label htmlFor="organizationId" className="mb-2 block text-sm font-medium">
            المنظمة
          </label>
          <div className="relative mt-2 rounded-md">
            <select
              id="organizationId"
              name="organizationId"
              className="peer block w-full rounded-md border border-gray-200 py-2 px-3 text-sm outline-2 placeholder:text-gray-500"
              defaultValue=""
              aria-describedby="organization-error"
            >
              <option value="" disabled>
                اختر منظمة
              </option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div id="organization-error" aria-live="polite" aria-atomic="true">
            {state.errors?.organizationId &&
              state.errors.organizationId.map((error: string) => (
                <p key={error} className="mt-2 text-sm text-red-500">
                  {error}
                </p>
              ))}
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="name" className="mb-2 block text-sm font-medium">
            اسم الفرع
          </label>
          <div className="relative mt-2 rounded-md">
            <input
              id="name"
              name="name"
              type="text"
              placeholder="أدخل اسم الفرع"
              className="peer block w-full rounded-md border border-gray-200 py-2 px-3 text-sm outline-2 placeholder:text-gray-500"
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
          href="/dashboard/branches"
          className="flex h-10 items-center rounded-lg bg-gray-100 px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
        >
          إلغاء
        </Link>
        <Button type="submit">إنشاء الفرع</Button>
      </div>
    </form>
  );
}
