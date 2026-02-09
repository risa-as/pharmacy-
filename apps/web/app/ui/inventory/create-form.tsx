"use client";

import { useFormState } from "react-dom";
import { createInventory } from "@/app/lib/actions/inventory";
import Link from "next/link";
import { Package, ArrowRight } from "lucide-react";

interface Branch {
    id: string;
    name: string;
}

interface Drug {
    id: string;
    tradeName: string;
    barcode: string;
}

export default function CreateInventoryForm({ branches, drugs }: { branches: Branch[]; drugs: Drug[] }) {
    const initialState: any = { message: "", errors: {} };
    const [state, dispatch] = useFormState(createInventory, initialState);

    return (
        <form action={dispatch} className="space-y-6">
            {/* الفرع */}
            <div>
                <label htmlFor="branchId" className="mb-2 block text-sm font-bold text-gray-700">
                    الفرع
                </label>
                <select
                    id="branchId"
                    name="branchId"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                >
                    <option value="">اختر الفرع</option>
                    {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                            {branch.name}
                        </option>
                    ))}
                </select>
                {state.errors?.branchId && (
                    <p className="mt-1 text-sm text-red-500">{state.errors.branchId}</p>
                )}
            </div>

            {/* الدواء */}
            <div>
                <label htmlFor="drugId" className="mb-2 block text-sm font-bold text-gray-700">
                    الدواء
                </label>
                <select
                    id="drugId"
                    name="drugId"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                >
                    <option value="">اختر الدواء</option>
                    {drugs.map((drug) => (
                        <option key={drug.id} value={drug.id}>
                            {drug.tradeName} ({drug.barcode})
                        </option>
                    ))}
                </select>
                {state.errors?.drugId && (
                    <p className="mt-1 text-sm text-red-500">{state.errors.drugId}</p>
                )}
            </div>

            {/* السعر والتكلفة */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="price" className="mb-2 block text-sm font-bold text-gray-700">
                        سعر البيع
                    </label>
                    <input
                        type="number"
                        id="price"
                        name="price"
                        step="0.01"
                        min="0"
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        required
                    />
                </div>
                <div>
                    <label htmlFor="cost" className="mb-2 block text-sm font-bold text-gray-700">
                        سعر الشراء
                    </label>
                    <input
                        type="number"
                        id="cost"
                        name="cost"
                        step="0.01"
                        min="0"
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        required
                    />
                </div>
            </div>

            {/* الحد الأدنى والأقصى */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="minStock" className="mb-2 block text-sm font-bold text-gray-700">
                        الحد الأدنى للمخزون
                    </label>
                    <input
                        type="number"
                        id="minStock"
                        name="minStock"
                        min="0"
                        defaultValue={0}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                </div>
                <div>
                    <label htmlFor="maxStock" className="mb-2 block text-sm font-bold text-gray-700">
                        الحد الأقصى للمخزون
                    </label>
                    <input
                        type="number"
                        id="maxStock"
                        name="maxStock"
                        min="1"
                        defaultValue={1000}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                </div>
            </div>

            {/* رسالة الخطأ */}
            {state.message && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">
                    {state.message}
                </div>
            )}

            {/* الأزرار */}
            <div className="flex gap-4">
                <button
                    type="submit"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-bold text-white transition-colors hover:bg-blue-700"
                >
                    <Package className="h-5 w-5" />
                    إضافة للمخزون
                </button>
                <Link
                    href="/dashboard/inventory"
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-6 py-3 font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
