"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import ExpiryDateField, { checkExpiry } from "./expiry-date-field";
import { useConfirm } from "../confirm-dialog";

interface Supplier {
  id: string;
  name: string;
}

interface CreateDrugModalProps {
  initialBarcode: string;
  branches: { id: string; name: string }[];
  onClose: () => void;
}

export default function CreateDrugModal({
  initialBarcode,
  branches,
  onClose,
}: CreateDrugModalProps) {
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [mounted, setMounted] = useState(false);
  const [packetPrice, setPacketPrice] = useState<number>(0);
  const [stripSellPrice, setStripSellPrice] = useState<number>(0);
  const [stripsPerPacket, setStripsPerPacket] = useState<number>(1);
  const computedCost = stripsPerPacket > 0 ? packetPrice / stripsPerPacket : 0;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetch("/api/suppliers")
      .then((r) => (r.ok ? r.json() : []))
      .then(setSuppliers)
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);

    // الكمية صفر = لا يُقبل الحفظ
    const qty = parseInt(formData.get("quantity") as string, 10) || 0;
    if (qty <= 0) {
      toast.error("لا يمكن الحفظ: الكمية يجب أن تكون أكبر من صفر");
      return;
    }
    // سعر الباكيت أقل من 125 دينار = تحذير وتأكيد قبل الحفظ
    if (packetPrice < 125) {
      const ok = await confirm({
        title: "سعر الباكيت منخفض",
        message: `سعر الباكيت المدخل (${packetPrice.toLocaleString("en")} د.ع) أقل من 125 دينار.\nتأكد أنه سعر الباكيت الصحيح.`,
        variant: "warning",
      });
      if (!ok) return;
    }
    // عدد الأشرطة في الباكيت يساوي الكمية الكلية أو مرتفع جداً = غالباً أُدخل الإجمالي بالخطأ
    if (stripsPerPacket > 20 || (qty > 10 && stripsPerPacket >= qty)) {
      const ok = await confirm({
        title: "عدد الأشرطة يبدو غير صحيح",
        message:
          `عدد الأشرطة في الباكيت (${stripsPerPacket}) يبدو غير صحيح.\n` +
          `هذا الحقل يعني عدد الأشرطة داخل الباكيت الواحد، وليس إجمالي الأشرطة المستلمة (الكمية المدخلة: ${qty}).\n` +
          `سعر التكلفة للشريط سيُحسب: ${packetPrice} ÷ ${stripsPerPacket} = ${computedCost.toLocaleString("en", { maximumFractionDigits: 2 })} د.ع`,
        variant: "warning",
      });
      if (!ok) return;
    }
    // سعر بيع الشريط مطلوب
    if (stripSellPrice <= 0) {
      toast.error("يرجى إدخال سعر بيع الشريط (الجمهور)");
      return;
    }
    // البيع أقل من أو يساوي الشراء = غالباً خطأ إدخال
    if (computedCost > 0 && stripSellPrice <= computedCost) {
      const ok = await confirm({
        title: "سعر البيع أقل من التكلفة",
        message:
          `سعر بيع الشريط (${stripSellPrice.toLocaleString("en", { maximumFractionDigits: 2 })} د.ع) ` +
          `أقل من أو يساوي تكلفته (${computedCost.toLocaleString("en", { maximumFractionDigits: 2 })} د.ع).`,
        variant: "danger",
      });
      if (!ok) return;
    }
    // البيع أكثر من ضعف الشراء = ربما أُدخل سعر الباكيت بدلاً من الشريط
    if (computedCost > 0 && stripSellPrice > 2 * computedCost) {
      const ok = await confirm({
        title: "سعر البيع مرتفع جداً",
        message:
          `سعر بيع الشريط (${stripSellPrice.toLocaleString("en", { maximumFractionDigits: 2 })} د.ع) ` +
          `أكثر من ضعف تكلفته (${computedCost.toLocaleString("en", { maximumFractionDigits: 2 })} د.ع).\n` +
          `تأكد أنك أدخلت سعر الشريط وليس سعر الباكيت.`,
        variant: "warning",
      });
      if (!ok) return;
    }
    // تصحيح سنة الصلاحية (27 → 2027) والتحذير من التواريخ المنتهية/البعيدة
    const expiry = checkExpiry(formData.get("expiryDate") as string);
    if (expiry.warning) {
      const ok = await confirm({
        title: "تحقق من تاريخ الانتهاء",
        message: expiry.warning,
        variant: expiry.severity ?? "warning",
      });
      if (!ok) return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/inventory/create-quick", {
        method: "POST",
        body: JSON.stringify({
          barcode: initialBarcode,
          tradeName: formData.get("tradeName"),
          scientificName: formData.get("scientificName"),
          origin: formData.get("origin"),
          branchId: formData.get("branchId"),
          price: stripSellPrice,
          cost: computedCost,
          minStock: parseInt(formData.get("minStock") as string, 10),
          maxStock: parseInt(formData.get("maxStock") as string, 10),
          quantity: parseInt(formData.get("quantity") as string, 10),
          expiryDate: expiry.value || null,
          supplierId: formData.get("supplierId") || null,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("تمت إضافة الدواء للمخزون بنجاح");
        router.refresh();
        onClose();
      } else {
        toast.error(data?.message || "فشل إضافة الدواء");
      }
    } catch (error) {
      console.error("Create drug failed:", error);
      toast.error("حدث خطأ أثناء إنشاء الدواء");
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <>
      {confirmDialog}
      {createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-foreground">تسجيل دواء جديد</h3>
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
                الباركود
              </label>
              <input
                type="text"
                name="barcode"
                value={initialBarcode}
                readOnly
                className="w-full rounded-lg border border-border px-4 py-2 bg-muted font-mono"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-bold text-foreground mb-1">
                الاسم التجاري
              </label>
              <input
                type="text"
                name="tradeName"
                required
                autoFocus
                className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-bold text-foreground mb-1">
                الاسم العلمي
              </label>
              <input
                type="text"
                name="scientificName"
                required
                className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-bold text-foreground mb-1">
                المصدر/المنشأ
              </label>
              <input
                type="text"
                name="origin"
                placeholder="مثال: Pfizer, Generic..."
                className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>

            {branches.length === 1 ? (
              <input type="hidden" name="branchId" value={branches[0].id} />
            ) : (
              <div className="col-span-2">
                <label className="block text-sm font-bold text-foreground mb-1">
                  الفرع
                </label>
                <select
                  name="branchId"
                  required
                  defaultValue=""
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-ring focus:ring-2 focus:ring-ring/20"
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
            )}

            {/* الأسعار — تُدخل بالباكيت وتُحسب للشريط تلقائياً */}
            <div className="col-span-2">
              <label className="block text-sm font-bold text-foreground mb-1">
                الأسعار
              </label>
              <p className="text-[11px] text-muted-foreground mb-2">
                التكلفة تُدخل بسعر <span className="font-bold text-foreground">الباكيت</span> وتُقسم تلقائياً، أما سعر البيع فأدخله <span className="font-bold text-foreground">للشريط الواحد</span> مباشرة.
              </p>
              <div className="mb-2">
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
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    سعر شراء الباكيت (التكلفة)
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
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    سعر بيع الشريط (الجمهور)
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={stripSellPrice || ""}
                    onChange={(e) =>
                      setStripSellPrice(parseFloat(e.target.value) || 0)
                    }
                    placeholder="0"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    سعر الشريط الواحد — وليس الباكيت
                  </p>
                </div>
              </div>
              <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">سعر التكلفة للشريط:</span>
                  <span className="text-sm font-bold text-primary tabular-nums">
                    {packetPrice > 0
                      ? `${packetPrice} ÷ ${stripsPerPacket} = ${computedCost.toLocaleString("en", { maximumFractionDigits: 2 })}`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">سعر البيع للشريط:</span>
                  <span className="text-sm font-bold text-success tabular-nums">
                    {stripSellPrice > 0
                      ? stripSellPrice.toLocaleString("en", { maximumFractionDigits: 2 })
                      : "—"}
                  </span>
                </div>
              </div>
              {stripsPerPacket > 20 && (
                <p className="text-xs font-bold text-warning mt-1.5 flex items-center gap-1">
                  <span>⚠</span>
                  هذا الحقل هو عدد الأشرطة داخل الباكيت الواحد وليس إجمالي الأشرطة — سيظهر تأكيد عند الحفظ
                </p>
              )}
              {packetPrice > 0 && packetPrice < 125 && (
                <p className="text-xs font-bold text-warning mt-1.5 flex items-center gap-1">
                  <span>⚠</span>
                  سعر الباكيت أقل من 125 دينار — سيظهر تأكيد عند الحفظ
                </p>
              )}
              {stripSellPrice > 0 && computedCost > 0 && stripSellPrice <= computedCost && (
                <p className="text-xs font-bold text-destructive mt-1.5 flex items-center gap-1">
                  <span>⚠</span>
                  سعر بيع الشريط أقل من أو يساوي تكلفته — سيظهر تأكيد عند الحفظ
                </p>
              )}
              {computedCost > 0 && stripSellPrice > 2 * computedCost && (
                <p className="text-xs font-bold text-warning mt-1.5 flex items-center gap-1">
                  <span>⚠</span>
                  سعر بيع الشريط أكثر من ضعف تكلفته — هل أدخلت سعر الباكيت بالخطأ؟ سيظهر تأكيد عند الحفظ
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 col-span-2">
              <div>
                <label className="block text-sm font-bold text-foreground mb-1">
                  الحد الأدنى
                </label>
                <input
                  type="number"
                  name="minStock"
                  defaultValue="1"
                  min="1"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-ring focus:ring-2 focus:ring-ring/20"
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
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-bold text-foreground mb-1">
                المورد (اختياري)
              </label>
              <select
                name="supplierId"
                className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="">اختر مورداً...</option>
                {suppliers.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2 border-t pt-4 mt-2">
              <h4 className="text-sm font-bold text-foreground mb-3">
                الدفعة الأولى
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-foreground mb-1">
                    الكمية
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    defaultValue="0"
                    min="1"
                    required
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    * لا يُقبل الحفظ إذا كانت الكمية صفر
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-foreground mb-1">
                    تاريخ الانتهاء
                  </label>
                  <ExpiryDateField name="expiryDate" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-success hover:bg-success/90 text-success-foreground py-2.5 rounded-lg font-bold transition-all disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {loading ? "جاري الحفظ..." : "حفظ الدواء"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-muted hover:bg-muted text-foreground rounded-lg font-bold"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
      )}
    </>
  );
}
