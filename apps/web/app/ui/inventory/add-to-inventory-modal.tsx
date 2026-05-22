"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface GlobalDrug {
  id: string;
  tradeName: string;
  barcode: string;
}

interface AddToInventoryModalProps {
  drug: GlobalDrug;
  branches: { id: string; name: string }[];
  onClose: () => void;
}

export default function AddToInventoryModal({
  drug,
  branches,
  onClose,
}: AddToInventoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [packetPrice, setPacketPrice] = useState<number>(0);
  const [stripsPerPacket, setStripsPerPacket] = useState<number>(1);
  const computedCost = stripsPerPacket > 0 ? packetPrice / stripsPerPacket : 0;
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/inventory/add-to-branch", {
        method: "POST",
        body: JSON.stringify({
          drugId: drug.id,
          branchId: formData.get("branchId"),
          price: parseFloat(formData.get("price") as string),
          cost: computedCost,
          minStock: parseInt(formData.get("minStock") as string, 10),
          maxStock: parseInt(formData.get("maxStock") as string, 10),
          quantity: parseInt(formData.get("quantity") as string, 10),
          expiryDate: formData.get("expiryDate"),
        }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("تمت إضافة الدواء للمخزون بنجاح");
        router.refresh();
        onClose();
      } else {
        toast.error(data?.message || "فشل إضافة الدواء للمخزون");
      }
    } catch (error) {
      console.error("Add to inventory failed:", error);
      toast.error("حدث خطأ أثناء إضافة الدواء للمخزون");
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-foreground">إضافة للمخزون</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {drug.tradeName} ({drug.barcode})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-bold text-foreground mb-1">
                الفرع
              </label>
              <select
                name="branchId"
                required
                defaultValue=""
                className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
              >
                <option value="" disabled>
                  اختر الفرع...
                </option>
                {branches.map((branch: any) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground mb-1">
                سعر البيع
              </label>
              <input
                type="number"
                name="price"
                required
                min="0"
                step="any"
                className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
              />
            </div>

            {/* حاسبة سعر التكلفة من الباكيت */}
            <div className="col-span-2">
              <label className="block text-sm font-bold text-foreground mb-2">
                سعر التكلفة (من الباكيت)
              </label>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    سعر الباكيت
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={packetPrice || ""}
                    onChange={(e) =>
                      setPacketPrice(parseFloat(e.target.value) || 0)
                    }
                    placeholder="0"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    عدد الأشرطة في الباكيت
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={stripsPerPacket || ""}
                    onChange={(e) =>
                      setStripsPerPacket(
                        Math.max(1, parseInt(e.target.value) || 1),
                      )
                    }
                    placeholder="1"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
                <span className="text-xs text-muted-foreground">
                  سعر التكلفة للشريط:
                </span>
                <span className="text-sm font-bold text-primary mr-auto tabular-nums">
                  {packetPrice > 0
                    ? `${packetPrice} ÷ ${stripsPerPacket} = ${computedCost.toLocaleString("en", { maximumFractionDigits: 2 })}`
                    : "—"}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground mb-1">
                الحد الأدنى
              </label>
              <input
                type="number"
                name="minStock"
                defaultValue="1"
                min="0"
                className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-foreground mb-1">
                الحد الأقصى
              </label>
              <input
                type="number"
                name="maxStock"
                defaultValue="10"
                min="0"
                className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div className="col-span-2 border-t border-border pt-4 mt-2">
              <h4 className="text-sm font-bold text-foreground mb-3">
                الدفعة الأولى
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-foreground mb-1">
                    الكمية الحالية
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    defaultValue="0"
                    min="0"
                    required
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-foreground mb-1">
                    تاريخ الانتهاء
                  </label>
                  <input
                    type="date"
                    name="expiryDate"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-lg font-bold disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {loading ? "جاري الحفظ..." : "إضافة للمخزون"}
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
    </div>,
    document.body,
  );
}
