"use client";

import { useState } from "react";
import { Plus, Package, Zap } from "lucide-react";
import AddBatchModal from "./add-batch-modal";
import { UpdateInventory, DeleteInventory } from "./buttons";

interface InventoryItem {
  id: string;
  drug: {
    id: string;
    tradeName: string;
    barcode: string;
    isQuickSale: boolean;
  };
  branch: { name: string };
  currentStock: number;
  minStock: number;
  maxStock: number;
  price: number;
  batches: {
    id: string;
    quantity: number;
    expiryDate: Date;
    batchNumber: string;
  }[];
}

export default function InventoryTable({ items, canEditDrug = true, canDeleteDrug = true, canAddDrug = true }: { items: InventoryItem[]; canEditDrug?: boolean; canDeleteDrug?: boolean; canAddDrug?: boolean }) {
  const [selectedInventory, setSelectedInventory] = useState<{
    id: string;
    drugName: string;
  } | null>(null);
  const [quickSaleState, setQuickSaleState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(items.map((i) => [i.drug.id, i.drug.isQuickSale])),
  );
  const [toggling, setToggling] = useState<string | null>(null);

  const handleQuickSaleToggle = async (drugId: string) => {
    setToggling(drugId);
    const newValue = !quickSaleState[drugId];
    setQuickSaleState((prev) => ({ ...prev, [drugId]: newValue }));
    try {
      const res = await fetch("/api/inventory/quick-sale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drugId, isQuickSale: newValue }),
      });
      if (!res.ok)
        setQuickSaleState((prev) => ({ ...prev, [drugId]: !newValue }));
    } catch {
      setQuickSaleState((prev) => ({ ...prev, [drugId]: !newValue }));
    } finally {
      setToggling(null);
    }
  };

  return (
    <>
      <div className="overflow-x-auto rounded-xl bg-transparent border border-border shadow-sm">
        <table className="min-w-full text-foreground">
          <thead className="bg-card/50 text-right text-sm font-semibold text-foreground border-b border-border">
            <tr>
              <th scope="col" className="px-2 py-3 font-cairo text-center w-12">
                #
              </th>
              <th scope="col" className="px-3 py-3 font-cairo">
                اسم الدواء
              </th>
              <th scope="col" className="px-3 py-3 font-cairo">
                الفرع
              </th>
              <th scope="col" className="px-3 py-3 font-cairo">
                الكمية الحالية
              </th>
              <th scope="col" className="px-3 py-3 font-cairo">
                الحدود
              </th>
              <th scope="col" className="px-3 py-3 font-cairo">
                الحالة
              </th>
              <th scope="col" className="px-3 py-3 font-cairo">
                سعر الجمهور
              </th>
              <th scope="col" className="px-3 py-3 font-cairo text-center">
                <span className="flex items-center justify-center gap-1">
                  <Zap className="w-4 h-4 text-amber-500" />
                  بيع سريع
                </span>
              </th>
              <th scope="col" className="px-3 py-3 font-cairo">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-transparent">
            {items.map((item: any, index: number) => {
              const status =
                item.currentStock === 0
                  ? "نفد"
                  : item.currentStock < item.minStock
                    ? "نقص في المخزون"
                    : item.currentStock > item.maxStock
                      ? "مخزون زائد"
                      : "جيد";

              const statusColor =
                item.currentStock === 0
                  ? "bg-destructive/10 text-destructive"
                  : item.currentStock < item.minStock
                    ? "bg-warning/10 text-warning"
                    : item.currentStock > item.maxStock
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-success/10 text-success";

              return (
                <tr
                  key={item.id}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <td className="whitespace-nowrap px-2 py-3 text-center text-sm text-muted-foreground font-mono">
                    {index + 1}
                  </td>
                  <td className="px-3 py-3 min-w-[160px]">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {item.drug.tradeName}
                      </span>
                      <span
                        className="text-xs text-muted-foreground font-mono"
                        title={item.drug.barcode}
                      >
                        {item.drug.barcode.length > 20
                          ? item.drug.barcode.slice(0, 20) + "…"
                          : item.drug.barcode}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                    {item.branch.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-bold text-foreground">
                    {item.currentStock}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground dir-ltr text-right">
                    {item.minStock} / {item.maxStock}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusColor}`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-bold text-foreground">
                    {item.price.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-center">
                    <button
                      dir="ltr"
                      onClick={() => handleQuickSaleToggle(item.drug.id)}
                      disabled={toggling === item.drug.id}
                      title="تفعيل/إلغاء البيع السريع"
                      className={`w-9 h-5 rounded-full transition-colors relative inline-flex items-center ${
                        quickSaleState[item.drug.id]
                          ? "bg-amber-400"
                          : "bg-muted-foreground/30"
                      } ${toggling === item.drug.id ? "opacity-50" : ""}`}
                    >
                      <span
                        className={`absolute w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          quickSaleState[item.drug.id]
                            ? "translate-x-4"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center gap-2">
                      {canAddDrug && (
                        <button
                          onClick={() =>
                            setSelectedInventory({
                              id: item.id,
                              drugName: item.drug.tradeName,
                            })
                          }
                          title="إضافة دفعة"
                          className="flex items-center justify-center text-primary hover:text-primary hover:bg-primary/10 p-2 rounded-lg border border-border/60"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                      {canEditDrug && <UpdateInventory id={item.id} />}
                      {canDeleteDrug && <DeleteInventory id={item.id} />}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-6 py-10 text-center text-muted-foreground"
                >
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
