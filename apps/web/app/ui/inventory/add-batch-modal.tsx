"use client";

import { FormEvent, useState } from "react";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { addBatch } from "@/app/lib/actions/inventory";

interface AddBatchModalProps {
    inventoryId: string;
    drugName: string;
    onClose: () => void;
}

export default function AddBatchModal({ inventoryId, drugName, onClose }: AddBatchModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const router = useRouter();

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        const formData = new FormData(e.currentTarget);
        formData.set("inventoryId", inventoryId);

        try {
            const result = await addBatch(null, formData);

            if (result?.message) {
                setError(result.message);
                return;
            }

            onClose();
            router.refresh();
        } catch (submitError) {
            console.error("Add batch failed:", submitError);
            setError("حدث خطأ غير متوقع أثناء إضافة الدفعة.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-card rounded-xl p-6 w-full max-w-md shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-foreground">إضافة دفعة جديدة</h3>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-muted rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <p className="text-sm text-muted-foreground mb-4">
                    للدواء: <span className="font-bold text-foreground">{drugName}</span>
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">رقم الدفعة</label>
                        <input
                            type="text"
                            name="batchNumber"
                            required
                            className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                            placeholder="مثال: LOT-2024-001"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">الكمية</label>
                        <input
                            type="number"
                            name="quantity"
                            required
                            min="1"
                            className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                            placeholder="0"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">سعر شراء الدفعة (التكلفة للعلبة)</label>
                        <input
                            type="number"
                            name="costPrice"
                            required
                            min="0"
                            step="250"
                            className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20 font-mono text-left"
                            placeholder="0"
                            dir="ltr"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">تاريخ انتهاء الصلاحية</label>
                        <input
                            type="date"
                            name="expiryDate"
                            required
                            className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                        />
                    </div>

                    {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-lg">{error}</p>}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-lg font-bold disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            {loading ? "جاري الإضافة..." : "إضافة الدفعة"}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg font-bold"
                        >
                            إلغاء
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
