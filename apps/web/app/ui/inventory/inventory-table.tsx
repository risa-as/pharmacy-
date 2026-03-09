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
            <div className="rounded-xl bg-transparent border border-border shadow-sm overflow-hidden">
                <table className="min-w-full text-foreground">
                    <thead className="bg-card/50 text-right text-sm font-semibold text-foreground border-b border-border">
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
                    <tbody className="divide-y divide-border bg-transparent">
                        {items.map((item: any) => {
                            const status = item.currentStock <= item.minStock
                                ? "نقص في المخزون"
                                : item.currentStock >= item.maxStock
                                    ? "مخزون زائد"
                                    : "جيد";

                            const statusColor = item.currentStock <= item.minStock
                                ? "bg-destructive/10 text-destructive"
                                : item.currentStock >= item.maxStock
                                    ? "bg-warning/10 text-warning"
                                    : "bg-success/10 text-success";

                            return (
                                <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                                    <td className="whitespace-nowrap px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-foreground">{item.drug.tradeName}</span>
                                            <span className="text-xs text-muted-foreground font-mono">{item.drug.barcode}</span>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                                        {item.branch.name}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 font-bold text-foreground">
                                        {item.currentStock}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 text-muted-foreground dir-ltr text-right">
                                        {item.minStock} / {item.maxStock}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4">
                                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusColor}`}>
                                            {status}
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 font-bold text-foreground">
                                        {item.price.toFixed(2)}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setSelectedInventory({ id: item.id, drugName: item.drug.tradeName })}
                                                className="flex items-center gap-1 text-primary hover:text-primary hover:bg-primary/10 px-2 py-1 rounded-lg text-sm font-medium"
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
                                <td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">
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
