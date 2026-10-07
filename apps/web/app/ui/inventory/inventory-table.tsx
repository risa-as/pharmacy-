"use client";

import { useState } from "react";
import { Plus, Zap } from "lucide-react";
import { formatCurrency } from "@/app/lib/utils/currency";
import { displayText } from "@/app/lib/display-text";
import AddBatchModal from "./add-batch-modal";
import { UpdateInventory, DeleteInventory } from "./buttons";

interface InventoryItem {
  id: string;
  /** Per-branch quick-sale flag (N09). */
  isQuickSale: boolean;
  drug: {
    id: string;
    tradeName: string;
    barcode: string;
    // ميزة وحدة التسعير: محمّلان أصلاً ضمن include: { drug: true }،
    // فتمريرهما للنافذة بلا كلفة ويوفّر ذهاباً وإياباً إلى قاعدة بعيدة.
    unitsPerPack?: number | null;
    unitsPerPackConfirmedAt?: Date | string | null;
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
    // محمّلان أصلاً ضمن include: { batches: true } — منهما تُشتق آخر كلفة.
    costPrice?: number;
    createdAt?: Date | string;
  }[];
}

/**
 * آخر كلفة وحالة التعبئة من البيانات المحمّلة أصلاً مع الصف.
 *
 * سبب وجودها: النافذة كانت تجلب هذه القيم بنفسها عند الفتح، فينتظر
 * الصيدلاني ثانية أو اثنتين قبل أن تكتمل الواجهة. والقيم موجودة هنا أصلاً
 * (include: { batches: true, drug: true})، فالجلب كان رحلتين إلى قاعدة بعيدة
 * (قرابة 183ms للرحلة الفارغة) لأجل بيانات في اليد.
 *
 * دفعة بكلفة صفر ليست مرجعاً للسعر (بونص)، فتُستبعد.
 */
function lastCostOf(item: InventoryItem) {
  const priced = item.batches.filter((b) => (b.costPrice ?? 0) > 0 && b.createdAt);
  priced.sort(
    (a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime(),
  );
  const newest = priced[0];
  return {
    unitsPerPack: item.drug.unitsPerPack ?? null,
    unitsPerPackConfirmed: Boolean(item.drug.unitsPerPackConfirmedAt),
    lastStripCost: newest ? newest.costPrice! : null,
    lastCostAt: newest ? new Date(newest.createdAt!).toISOString() : null,
  };
}

export default function InventoryTable({
  items,
  canEditDrug = true,
  canDeleteDrug = true,
  canAddDrug = true,
}: {
  items: InventoryItem[];
  canEditDrug?: boolean;
  canDeleteDrug?: boolean;
  canAddDrug?: boolean;
}) {
  const [selectedInventory, setSelectedInventory] = useState<{
    id: string;
    drugName: string;
    price: number;
    unitsPerPack: number | null;
    unitsPerPackConfirmed: boolean;
    lastStripCost: number | null;
    lastCostAt: string | null;
  } | null>(null);
  const [quickSaleState, setQuickSaleState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(items.map((i) => [i.id, i.isQuickSale])),
  );
  const [toggling, setToggling] = useState<string | null>(null);

  const handleQuickSaleToggle = async (inventoryId: string) => {
    setToggling(inventoryId);
    const newValue = !quickSaleState[inventoryId];
    setQuickSaleState((prev) => ({ ...prev, [inventoryId]: newValue }));
    try {
      const res = await fetch("/api/inventory/quick-sale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryId, isQuickSale: newValue }),
      });
      if (!res.ok)
        setQuickSaleState((prev) => ({ ...prev, [inventoryId]: !newValue }));
    } catch {
      setQuickSaleState((prev) => ({ ...prev, [inventoryId]: !newValue }));
    } finally {
      setToggling(null);
    }
  };

  return (
    <>
      {/* Same layout and styling as the batches table (app/ui/batches/batch-table.tsx). */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
            <tr>
              <th scope="col" className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">اسم الدواء</th>
              <th scope="col" className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الفرع</th>
              <th scope="col" className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الكمية الحالية</th>
              <th scope="col" className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">سعر البيع</th>
              <th scope="col" className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الحالة</th>
              <th scope="col" className="px-3 py-3 text-center font-medium font-cairo whitespace-nowrap">
                <span className="inline-flex items-center justify-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  بيع سريع
                </span>
              </th>
              <th scope="col" className="px-3 py-3 text-center font-medium font-cairo whitespace-nowrap">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {items.map((item: any) => {
              const out = item.currentStock === 0;
              const low = !out && item.currentStock < item.minStock;
              const surplus = !out && !low && item.currentStock > item.maxStock;

              let statusText = "جيد";
              let statusClass = "bg-success/10 text-success border-success/20";
              let barClass = "bg-primary";
              if (out) {
                statusText = "نفد";
                statusClass = "bg-destructive/10 text-destructive border-destructive/20";
                barClass = "bg-destructive";
              } else if (low) {
                statusText = "نقص في المخزون";
                statusClass = "bg-warning/10 text-warning border-warning/20";
                barClass = "bg-warning";
              } else if (surplus) {
                statusText = "مخزون زائد";
                statusClass = "bg-amber-500/10 text-amber-600 border-amber-500/20";
                barClass = "bg-amber-500";
              }
              // Share of this branch's maximum stock currently held.
              const fillPct = item.maxStock > 0
                ? Math.min(100, Math.round((item.currentStock / item.maxStock) * 100))
                : 0;

              return (
                <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-3 py-3">
                    <div className="max-w-[180px]">
                      <p className="font-semibold text-foreground truncate" title={item.drug.tradeName}>
                        {item.drug.tradeName}
                      </p>
                      {displayText(item.drug.barcode) ? (
                        <p className="text-[10px] text-muted-foreground truncate text-right" dir="ltr" title={item.drug.barcode}>
                          {displayText(item.drug.barcode)}
                        </p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground/50">—</p>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <span className="block max-w-[140px] truncate" title={item.branch.name}>
                      {item.branch.name}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="min-w-[105px] space-y-1">
                      <span className="font-bold text-foreground">{item.currentStock}</span>
                      <div className="h-1 w-full max-w-[90px] rounded-sm bg-muted overflow-hidden">
                        <div className={`h-full rounded-sm ${barClass}`} style={{ width: `${fillPct}%` }} />
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                        الأدنى: <span className="font-semibold text-foreground">{item.minStock}</span>
                        {" · "}
                        الأقصى: <span className="font-semibold text-foreground">{item.maxStock}</span>
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-bold text-foreground whitespace-nowrap" dir="ltr">
                    {formatCurrency(Number(item.price) || 0)}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold ${statusClass}`}>
                      {statusText}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      dir="ltr"
                      onClick={() => handleQuickSaleToggle(item.id)}
                      disabled={toggling === item.id}
                      title="تفعيل/إلغاء البيع السريع"
                      className={`w-9 h-5 rounded-full transition-colors relative inline-flex items-center ${
                        quickSaleState[item.id]
                          ? "bg-amber-400"
                          : "bg-muted-foreground/30"
                      } ${toggling === item.id ? "opacity-50" : ""}`}
                    >
                      <span
                        className={`absolute w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          quickSaleState[item.id]
                            ? "translate-x-4"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      {canAddDrug && (
                        <button
                          onClick={() =>
                            setSelectedInventory({
                              id: item.id,
                              drugName: item.drug.tradeName,
                              price: Number(item.price) || 0,
                              ...lastCostOf(item),
                            })
                          }
                          title="إضافة دفعة"
                          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
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
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {selectedInventory && (
        <AddBatchModal
          inventoryId={selectedInventory.id}
          drugName={selectedInventory.drugName}
          currentPrice={selectedInventory.price}
          unitsPerPack={selectedInventory.unitsPerPack}
          unitsPerPackConfirmed={selectedInventory.unitsPerPackConfirmed}
          lastStripCost={selectedInventory.lastStripCost}
          lastCostAt={selectedInventory.lastCostAt}
          onClose={() => setSelectedInventory(null)}
        />
      )}
    </>
  );
}
