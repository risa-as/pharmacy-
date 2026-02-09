"use client";

import { useState } from "react";
import { Plus, Package } from "lucide-react";
import AddBatchModal from "./add-batch-modal";
import { UpdateInventory, DeleteInventory } from "./buttons";

interface InventoryItem {
    id: string;
    drug: { tradeName: string; barcode: string };
    branch: { name: string };
    currentStock: number;
    minStock: number;
    maxStock: number;
    price: number;
    batches: { id: string; quantity: number; expiryDate: Date; batchNumber: string }[];
}

export default function InventoryTable({ items }: { items: InventoryItem[] }) {
    const [selectedInventory, setSelectedInventory] = useState<{ id: string; drugName: string } | null>(null);

    return (
        <>
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full text-gray-900">
                    <thead className="bg-gray-50 text-right text-sm font-semibold text-gray-900 border-b border-gray-200">
                        <tr>
                            <th scope="col" className="px-6 py-4 font-cairo">اسم الدواء</th>
                            <th scope="col" className="px-6 py-4 font-cairo">الفرع</th>
                            <th scope="col" className="px-6 py-4 font-cairo">الكمية الحالية</th>
                            <th scope="col" className="px-6 py-4 font-cairo">الحدود</th>
                            <th scope="col" className="px-6 py-4 font-cairo">الحالة</th>
                            <th scope="col" className="px-6 py-4 font-cairo">سعر الجمهور</th>
                            <th scope="col" className="px-6 py-4 font-cairo">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {items.map((item) => {
                            const status = item.currentStock <= item.minStock
                                ? "نقص في المخزون"
                                : item.currentStock >= item.maxStock
                                    ? "مخزون زائد"
                                    : "جيد";

                            const statusColor = item.currentStock <= item.minStock
                                ? "bg-red-100 text-red-700"
                                : item.currentStock >= item.maxStock
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-green-100 text-green-700";

                            return (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="whitespace-nowrap px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-gray-900">{item.drug.tradeName}</span>
                                            <span className="text-xs text-gray-500 font-mono">{item.drug.barcode}</span>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 text-gray-500">
                                        {item.branch.name}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 font-bold text-gray-900">
                                        {item.currentStock}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 text-gray-500 dir-ltr text-right">
                                        {item.minStock} / {item.maxStock}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4">
                                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusColor}`}>
                                            {status}
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 font-bold text-gray-900">
                                        {item.price.toFixed(2)}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setSelectedInventory({ id: item.id, drugName: item.drug.tradeName })}
                                                className="flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-lg text-sm font-medium"
                                            >
                                                <Plus className="w-4 h-4" />
                                                إضافة دفعة
                                            </button>
                                            <UpdateInventory id={item.id} />
                                            <DeleteInventory id={item.id} />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                                    <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                    المخزون فارغ.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {selectedInventory && (
                <AddBatchModal
                    inventoryId={selectedInventory.id}
                    drugName={selectedInventory.drugName}
                    onClose={() => setSelectedInventory(null)}
                />
            )}
        </>
    );
}
