"use client";

import Link from "next/link";
import { Button } from "@faramace/ui";
import { useFormState } from "react-dom";
import { createDrug } from "@/app/lib/actions/drug";

export default function Form() {
    const initialState: any = { message: "", errors: {} };
    const [state, dispatch] = useFormState(createDrug, initialState);

    return (
        <form action={dispatch}>
            <div className="rounded-md bg-gray-50 p-4 md:p-6">

                <div className="mb-4">
                    <label htmlFor="barcode" className="mb-2 block text-sm font-medium">
                        الباركود
                    </label>
                    <div className="relative mt-2 rounded-md">
                        <input
                            id="barcode"
                            name="barcode"
                            type="text"
                            placeholder="امسح أو أدخل الباركود"
                            className="peer block w-full rounded-md border border-gray-200 py-2 px-3 text-sm outline-2 placeholder:text-gray-500"
                            required
                        />
                    </div>
                    <div id="barcode-error" aria-live="polite" aria-atomic="true">
                        {state.errors?.barcode &&
                            state.errors.barcode.map((error: string) => (
                                <p key={error} className="mt-2 text-sm text-red-500">
                                    {error}
                                </p>
                            ))}
                    </div>
                </div>

                <div className="mb-4">
                    <label htmlFor="tradeName" className="mb-2 block text-sm font-medium">
                        الاسم التجاري
                    </label>
                    <div className="relative mt-2 rounded-md">
                        <input
                            id="tradeName"
                            name="tradeName"
                            type="text"
                            placeholder="مثال: بنادول إكسترا"
                            className="peer block w-full rounded-md border border-gray-200 py-2 px-3 text-sm outline-2 placeholder:text-gray-500"
                            required
                        />
                    </div>
                    <div id="tradeName-error" aria-live="polite" aria-atomic="true">
                        {state.errors?.tradeName &&
                            state.errors.tradeName.map((error: string) => (
                                <p key={error} className="mt-2 text-sm text-red-500">
                                    {error}
                                </p>
                            ))}
                    </div>
                </div>

                <div className="mb-4">
                    <label htmlFor="scientificName" className="mb-2 block text-sm font-medium">
                        الاسم العلمي
                    </label>
                    <div className="relative mt-2 rounded-md">
                        <input
                            id="scientificName"
                            name="scientificName"
                            type="text"
                            placeholder="مثال: باراسيتامول"
                            className="peer block w-full rounded-md border border-gray-200 py-2 px-3 text-sm outline-2 placeholder:text-gray-500"
                            required
                        />
                    </div>
                </div>

                <div className="mb-4">
                    <label htmlFor="origin" className="mb-2 block text-sm font-medium">
                        بلد المنشأ / الشركة المصنعة
                    </label>
                    <div className="relative mt-2 rounded-md">
                        <input
                            id="origin"
                            name="origin"
                            type="text"
                            placeholder="مثال: GSK"
                            className="peer block w-full rounded-md border border-gray-200 py-2 px-3 text-sm outline-2 placeholder:text-gray-500"
                        />
                    </div>
                </div>

            </div>
            <div className="mt-6 flex justify-end gap-4">
                <Link
                    href="/dashboard/drugs"
                    className="flex h-10 items-center rounded-lg bg-gray-100 px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
                >
                    إلغاء
                </Link>
                <Button type="submit">إنشاء الدواء</Button>
            </div>
        </form>
    );
}
