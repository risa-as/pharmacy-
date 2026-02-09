"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { addBatch } from "@/app/lib/actions/inventory";

interface AddBatchModalProps {
    inventoryId: string;
    drugName: string;
    onClose: () => void;
}

export default function AddBatchModal({ inventoryId, drugName, onClose }: AddBatchModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (formData: FormData) => {
        setLoading(true);
        setError("");

        formData.append("inventoryId", inventoryId);

        const result = await addBatch(null, formData);

        if (result?.message) {
            setError(result.message);
            setLoading(false);
        } else {
            onClose();
            window.location.reload();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-800">إضافة دفعة جديدة</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <p className="text-sm text-gray-500 mb-4">
                    للدواء: <span className="font-bold text-gray-700">{drugName}</span>
                </p>

                <form action={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">
                            رقم الدفعة
                        </label>
                        <input
                            type="text"
                            name="batchNumber"
                            required
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            placeholder="مثال: LOT-2024-001"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">
                            الكمية
                        </label>
                        <input
                            type="number"
                            name="quantity"
                            required
                            min="1"
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            placeholder="0"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">
                            تاريخ انتهاء الصلاحية
                        </label>
                        <input
                            type="date"
                            name="expiryDate"
                            required
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            {loading ? "جاري الإضافة..." : "إضافة الدفعة"}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold"
                        >
                            إلغاء
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
