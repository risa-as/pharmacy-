"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { updateInventory } from "@/app/lib/actions/inventory";
import { Package, ArrowRight } from "lucide-react";
import { SubmitButton } from "@/app/ui/submit-button";

interface InventoryItem {
    id: string;
    branchId: string;
    drugId: string;
    price: number;
    cost: number;
    minStock: number;
    maxStock: number;
    branch: { name: string };
    drug: { tradeName: string };
}

interface Branch {
    id: string;
    name: string;
}

interface Drug {
    id: string;
    tradeName: string;
}

export default function EditForm({
    inventory,
    branches,
    drugs
}: {
    inventory: InventoryItem;
    branches: Branch[];
    drugs: Drug[];
}) {
    const initialState: any = { message: "", errors: {} };
    const updateInventoryWithId = updateInventory.bind(null, inventory.id);
    const [state, dispatch] = useFormState(updateInventoryWithId, initialState);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="animate-pulse h-96 bg-muted rounded-xl" />;
    }

    return (
        <form action={dispatch} className="space-y-6" suppressHydrationWarning>
            {/* الفرع */}
            <div>
                <label htmlFor="branchId" className="mb-2 block text-sm font-bold text-foreground">
                    الفرع
                </label>
                <select
                    id="branchId"
                    name="branchId"
                    defaultValue={inventory.branchId}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    required
                >
                    {branches.map((branch: any) => (
                        <option key={branch.id} value={branch.id}>
                            {branch.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* الدواء */}
            <div>
                <label htmlFor="drugId" className="mb-2 block text-sm font-bold text-foreground">
                    الدواء
                </label>
                <select
                    id="drugId"
                    name="drugId"
                    defaultValue={inventory.drugId}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    required
                >
                    {drugs.map((drug: any) => (
                        <option key={drug.id} value={drug.id}>
                            {drug.tradeName}
                        </option>
                    ))}
                </select>
            </div>

            {/* السعر والتكلفة */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="price" className="mb-2 block text-sm font-bold text-foreground">
                        سعر الجمهور
                    </label>
                    <input
                        id="price"
                        name="price"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={inventory.price}
                        className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                        required
                    />
                    {state.errors?.price && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.price}</p>
                    )}
                </div>
                <div>
                    <label htmlFor="cost" className="mb-2 block text-sm font-bold text-foreground">
                        سعر التكلفة
                    </label>
                    <input
                        id="cost"
                        name="cost"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={inventory.cost}
                        className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                        required
                    />
                    {state.errors?.cost && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.cost}</p>
                    )}
                </div>
            </div>

            {/* الحد الأدنى والأقصى */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="minStock" className="mb-2 block text-sm font-bold text-foreground">
                        الحد الأدنى
                    </label>
                    <input
                        id="minStock"
                        name="minStock"
                        type="number"
                        min="0"
                        defaultValue={inventory.minStock}
                        className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                </div>
                <div>
                    <label htmlFor="maxStock" className="mb-2 block text-sm font-bold text-foreground">
                        الحد الأقصى
                    </label>
                    <input
                        id="maxStock"
                        name="maxStock"
                        type="number"
                        min="1"
                        defaultValue={inventory.maxStock}
                        className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                </div>
            </div>

            {/* رسالة الخطأ */}
            {state.message && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
                    {state.message}
                </div>
            )}

            {/* الأزرار */}
            <div className="flex gap-4">
                <SubmitButton text="حفظ التغييرات" icon={Package} />
                <Link
                    href="/dashboard/inventory"
                    className="flex items-center gap-2 rounded-lg bg-muted px-6 py-3 font-bold text-muted-foreground transition-colors hover:bg-muted"
                >
                    <ArrowRight className="h-5 w-5" />
                    إلغاء
                </Link>
            </div>
        </form>
    );
}
