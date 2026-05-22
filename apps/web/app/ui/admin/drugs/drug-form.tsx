"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { createGlobalDrug, updateGlobalDrug } from "@/app/lib/actions/drug";
import { SubmitButton } from "@/app/ui/submit-button";

interface Drug {
    id: string;
    barcode: string;
    tradeName: string;
    scientificName: string;
    origin: string | null;
    isActive: boolean;
}

interface Props {
    mode: "create" | "edit";
    drug?: Drug;
    cancelHref: string;
}

export default function AdminDrugForm({ mode, drug, cancelHref }: Props) {
    const initialState: any = { message: "", errors: {} };

    const action = mode === "edit" && drug
        ? updateGlobalDrug.bind(null, drug.id)
        : createGlobalDrug;

    const [state, dispatch] = useFormState(action, initialState);

    return (
        <form action={dispatch} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
                {/* Barcode */}
                <div>
                    <label htmlFor="barcode" className="mb-2 block text-sm font-medium text-foreground">
                        الباركود <span className="text-destructive">*</span>
                    </label>
                    <input
                        id="barcode"
                        name="barcode"
                        type="text"
                        defaultValue={drug?.barcode ?? ""}
                        placeholder="امسح أو أدخل الباركود"
                        dir="ltr"
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all font-mono"
                        required
                    />
                    {state.errors?.barcode?.map((e: string) => (
                        <p key={e} className="mt-1.5 text-xs text-destructive">{e}</p>
                    ))}
                </div>

                {/* Trade Name */}
                <div>
                    <label htmlFor="tradeName" className="mb-2 block text-sm font-medium text-foreground">
                        الاسم التجاري <span className="text-destructive">*</span>
                    </label>
                    <input
                        id="tradeName"
                        name="tradeName"
                        type="text"
                        defaultValue={drug?.tradeName ?? ""}
                        placeholder="مثال: بنادول إكسترا"
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all"
                        required
                    />
                    {state.errors?.tradeName?.map((e: string) => (
                        <p key={e} className="mt-1.5 text-xs text-destructive">{e}</p>
                    ))}
                </div>

                {/* Scientific Name */}
                <div>
                    <label htmlFor="scientificName" className="mb-2 block text-sm font-medium text-foreground">
                        الاسم العلمي <span className="text-destructive">*</span>
                    </label>
                    <input
                        id="scientificName"
                        name="scientificName"
                        type="text"
                        defaultValue={drug?.scientificName ?? ""}
                        placeholder="مثال: Paracetamol"
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all"
                        required
                    />
                    {state.errors?.scientificName?.map((e: string) => (
                        <p key={e} className="mt-1.5 text-xs text-destructive">{e}</p>
                    ))}
                </div>

                {/* Origin */}
                <div>
                    <label htmlFor="origin" className="mb-2 block text-sm font-medium text-foreground">
                        المصدر / الشركة المصنعة
                    </label>
                    <input
                        id="origin"
                        name="origin"
                        type="text"
                        defaultValue={drug?.origin ?? ""}
                        placeholder="مثال: GSK"
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all"
                    />
                </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
                <input
                    id="isActive"
                    name="isActive"
                    type="checkbox"
                    defaultChecked={drug?.isActive ?? true}
                    className="h-5 w-5 rounded border-border bg-background text-primary focus:ring-2 focus:ring-primary/30 cursor-pointer"
                />
                <label htmlFor="isActive" className="text-sm font-medium cursor-pointer text-foreground">
                    نشط (متاح لجميع المنظمات في المخزون)
                </label>
            </div>

            {state.message && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                    {state.message}
                </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
                <Link
                    href={cancelHref}
                    className="flex h-10 items-center rounded-lg border border-border bg-muted px-5 text-sm font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                    إلغاء
                </Link>
                <SubmitButton
                    text={mode === "create" ? "إضافة للقاعدة العالمية" : "حفظ التعديلات"}
                    loadingText="جاري الحفظ..."
                />
            </div>
        </form>
    );
}
