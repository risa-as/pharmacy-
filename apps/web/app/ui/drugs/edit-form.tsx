"use client";

import Link from "next/link";
import { Button } from "@faramace/ui";
import { useFormState } from "react-dom";
import { updateDrug } from "@/app/lib/actions/drug";

interface Drug {
    id: string;
    barcode: string;
    tradeName: string;
    scientificName: string;
    origin: string | null;
    isActive: boolean;
}

export default function EditForm({ drug }: { drug: Drug }) {
    const initialState: any = { message: "", errors: {} };
    const updateDrugWithId = updateDrug.bind(null, drug.id);
    const [state, dispatch] = useFormState(updateDrugWithId, initialState);

    return (
        <form action={dispatch}>
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-6">
                <div className="grid gap-6 md:grid-cols-2">
                    <div>
                        <label htmlFor="barcode" className="mb-2 block text-sm font-medium text-gray-700">
                            الباركود
                        </label>
                        <input
                            id="barcode"
                            name="barcode"
                            type="text"
                            defaultValue={drug.barcode}
                            placeholder="أدخل الباركود"
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                            dir="ltr"
                            required
                        />
                        <div id="barcode-error" aria-live="polite" aria-atomic="true">
                            {state.errors?.barcode &&
                                state.errors.barcode.map((error: string) => (
                                    <p key={error} className="mt-2 text-sm text-red-500">
                                        {error}
                                    </p>
                                ))}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="tradeName" className="mb-2 block text-sm font-medium text-gray-700">
                            الاسم التجاري
                        </label>
                        <input
                            id="tradeName"
                            name="tradeName"
                            type="text"
                            defaultValue={drug.tradeName}
                            placeholder="مثال: بنادول"
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                            required
                        />
                        <div id="tradeName-error" aria-live="polite" aria-atomic="true">
                            {state.errors?.tradeName &&
                                state.errors.tradeName.map((error: string) => (
                                    <p key={error} className="mt-2 text-sm text-red-500">
                                        {error}
                                    </p>
                                ))}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="scientificName" className="mb-2 block text-sm font-medium text-gray-700">
                            الاسم العلمي
                        </label>
                        <input
                            id="scientificName"
                            name="scientificName"
                            type="text"
                            defaultValue={drug.scientificName}
                            placeholder="مثال: Paracetamol"
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="origin" className="mb-2 block text-sm font-medium text-gray-700">
                            المصدر / الشركة المصنعة
                        </label>
                        <input
                            id="origin"
                            name="origin"
                            type="text"
                            defaultValue={drug.origin || ""}
                            placeholder="مثال: GSK"
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="isActive"
                                defaultChecked={drug.isActive}
                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">نشط</span>
                        </label>
                    </div>
                </div>

                {state.message && (
                    <p className="mt-4 text-sm text-red-500">{state.message}</p>
                )}
            </div>
            <div className="mt-6 flex justify-end gap-4">
                <Link
                    href="/dashboard/drugs"
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
