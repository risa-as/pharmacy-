"use client";

import { readStocktakeReason } from "@/app/lib/stocktake-reasons";
import { useState } from "react";
import { useRouter } from "next/navigation";
// sonner لا react-hot-toast: الجذر (app/layout.tsx) يركّب <Toaster/> الخاص بـ
// sonner فقط، فنداءات react-hot-toast كانت تُنفَّذ بصمت دون ظهور أي رسالة.
import { toast } from "sonner";

export default function StocktakeForm({
  stocktakeId,
  initialData,
  isCompleted,
  review = false,
  canReview = false,
}: {
  stocktakeId: string;
  initialData: any[];
  isCompleted: boolean;
  review?: boolean;
  canReview?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(
    initialData.map((item) => ({
      ...item,
      ...readStocktakeReason(item.reason),
    })),
  );
  const [reviewNote, setReviewNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const handleQuantityChange = (batchId: string, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) return; // Don't crash on empty, just wait

    setItems(
      items.map((item: any) =>
        item.batchId === batchId
          ? {
              ...item,
              actualQuantity: num,
              difference: num - item.systemQuantity,
              reasonCode:
                num >= item.systemQuantity && item.reasonCode === "DAMAGE"
                  ? "UNKNOWN"
                  : item.reasonCode,
            }
          : item,
      ),
    );
  };

  const saveDraft = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/stocktake/${stocktakeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, status: "PENDING" }),
      });
      if (!res.ok) throw new Error("Failed to save draft");
      toast.success("تم الحفظ كمسودة");
    } catch (err: any) {
      toast.error("حدث خطأ أثناء الحفظ");
    } finally {
      setLoading(false);
    }
  };

  const completeStocktake = async () => {
    if (
      !confirm(
        "إذا وُجد عجز يُرسل الجرد إلى المدير قبل تعديل المخزون وتسجيل المصروف. دون عجز تُعتمد الكميات مباشرة. هل تريد المتابعة؟",
      )
    )
      return;

    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/stocktake/${stocktakeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, status: "COMPLETED" }),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to complete stocktake");

      toast.success(
        data.stocktake?.status === "REVIEW"
          ? "أُرسل العجز إلى المدير؛ المخزون لم يتغير بعد"
          : "تم اعتماد الجرد",
      );
      router.push("/dashboard/inventory/stocktakes");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  };

  const reviewAction = async (action: "APPROVE" | "RECOUNT") => {
    if (
      loading ||
      !confirm(
        action === "APPROVE"
          ? "ستُحدّث الكميات وتُسجّل قيمة العجز كمصروف، والتلف المحدد كمصروف تلف. تأكيد الاعتماد؟"
          : "سيُحفظ العد السابق في سجل المراجعة وتُفتح مسودة لإعادة العد دون تعديل المخزون. متابعة؟",
      )
    )
      return;
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/stocktake/${stocktakeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewNote: reviewNote.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تنفيذ الإجراء");
      toast.success(
        action === "APPROVE"
          ? "تم اعتماد العجز وتسوية المخزون"
          : "تم طلب إعادة العد",
      );
      router.push("/dashboard/inventory/stocktakes");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const totalLoss = items.reduce((sum: any, item: any) => {
    const diff = item.actualQuantity - item.systemQuantity;
    return diff < 0 ? sum + Math.abs(diff * item.costPrice) : sum;
  }, 0);

  const totalGain = items.reduce((sum: any, item: any) => {
    const diff = item.actualQuantity - item.systemQuantity;
    return diff > 0 ? sum + diff * item.costPrice : sum;
  }, 0);

  const filteredItems = items.filter(
    (i: any) =>
      i.drugName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.barcode.includes(searchTerm) ||
      i.scientificName?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      {review && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 space-y-3">
          <p>
            بانتظار اعتماد المدير. الكميات لم تتغير بعد. راجع العدد والعجز؛ إذا
            تغير المخزون منذ العد، اطلب إعادة العد.
          </p>
          {canReview && <label className="block text-sm">ملاحظة للموظف عند إعادة العد (اختياري)<textarea maxLength={1000} disabled={loading} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2" placeholder="مثال: أعد عدّ دفعة Brufen وافصل العلب التالفة." /></label>}
          {canReview && (
            <div className="flex gap-2">
              <button
                disabled={loading}
                onClick={() => reviewAction("APPROVE")}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2"
              >
                {loading ? "جارٍ التنفيذ…" : "اعتماد العجز"}
              </button>
              <button
                disabled={loading}
                onClick={() => reviewAction("RECOUNT")}
                className="rounded-lg border border-border px-4 py-2"
              >
                طلب إعادة العد
              </button>
            </div>
          )}
        </div>
      )}
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col items-center justify-center">
          <span className="text-muted-foreground text-sm mb-1">
            إجمالي المنتجات المجرودة
          </span>
          <span className="text-2xl font-black text-foreground">
            {items.length}
          </span>
        </div>
        <div className="bg-destructive/10 p-4 rounded-xl border border-destructive/20 flex flex-col items-center justify-center">
          <span className="text-destructive text-sm mb-1 font-bold">
            قيمة عجز الجرد بالتكلفة
          </span>
          <span className="text-2xl font-black text-destructive">
            {totalLoss.toLocaleString()} د.ع
          </span>
        </div>
        <div className="bg-success/10 p-4 rounded-xl border border-success/20 flex flex-col items-center justify-center">
          <span className="text-success text-sm mb-1 font-bold">
            قيمة فائض الجرد بالتكلفة
          </span>
          <span className="text-2xl font-black text-success">
            {totalGain.toLocaleString()} د.ع
          </span>
        </div>
      </div>

      <div className="bg-transparent rounded-xl border border-border shadow-sm overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-border">
          <input
            type="text"
            placeholder="ابحث عن دواء أو باركود للمطابقة..."
            className="w-full p-2 border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-card/50 sticky top-0 z-10 border-b border-border">
              <tr>
                <th className="p-3 font-medium text-muted-foreground">
                  اسم المنتج
                </th>
                <th className="w-28 px-2 py-3 font-medium text-muted-foreground">
                  الباركود
                </th>
                <th className="p-3 font-medium text-muted-foreground">
                  تاريخ الصلاحية
                </th>
                <th className="p-3 font-medium text-muted-foreground">
                  سعر التكلفة
                </th>
                <th className="p-3 font-bold text-foreground bg-muted/30">
                  النظام
                </th>
                <th className="p-3 font-bold text-primary bg-primary/5">
                  الفعلي (الجرد)
                </th>
                <th className="p-3 font-medium text-muted-foreground">الفرق</th>
                <th className="p-3 font-medium text-muted-foreground">
                  قيمة الفرق
                </th>
                <th className="p-3 font-medium text-muted-foreground">
                  التلف / ملاحظة
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item: any) => {
                const diff = (item.actualQuantity || 0) - item.systemQuantity;
                const impact = diff * item.costPrice;

                return (
                  <tr
                    key={item.batchId}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    <td className="p-3 font-medium text-foreground">
                      {item.drugName}
                    </td>
                    <td className="w-28 px-2 py-3 text-muted-foreground font-mono text-xs">
                      <span
                        dir="ltr"
                        title={item.barcode}
                        className="block w-24 truncate text-left"
                      >
                        {item.barcode}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(item.expiryDate).toLocaleDateString("en-GB", {
                        timeZone: "Asia/Baghdad",
                      })}
                    </td>
                    <td className="p-3 text-muted-foreground font-mono">
                      {item.costPrice.toLocaleString()}
                    </td>
                    <td className="p-3 font-bold text-muted-foreground bg-muted/20">
                      {item.systemQuantity}
                    </td>
                    <td className="p-3 bg-primary/5">
                      <input
                        type="number"
                        min="0"
                        disabled={isCompleted}
                        className="w-20 p-1.5 border border-primary/30 rounded text-center font-bold text-primary outline-none focus:border-primary disabled:opacity-50 disabled:bg-muted"
                        value={item.actualQuantity}
                        onChange={(e) =>
                          handleQuantityChange(item.batchId, e.target.value)
                        }
                      />
                    </td>
                    <td className="p-3">
                      <span
                        className={`font-bold inline-flex items-center justify-center px-2 py-1 rounded text-xs ${
                          diff > 0
                            ? "text-success bg-success/10"
                            : diff < 0
                              ? "text-destructive bg-destructive/10"
                              : "text-muted-foreground bg-muted"
                        }`}
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    </td>
                    <td
                      className="p-3 font-mono font-bold whitespace-nowrap"
                      dir="ltr"
                    >
                      <span
                        className={
                          impact < 0
                            ? "text-destructive"
                            : impact > 0
                              ? "text-success"
                              : "text-muted-foreground"
                        }
                      >
                        {impact.toLocaleString()} د.ع
                      </span>
                    </td>
                    <td className="p-3 min-w-56">
                      {diff < 0 && (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            disabled={isCompleted || loading}
                            checked={item.reasonCode === "DAMAGE"}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((row) =>
                                  row.batchId === item.batchId
                                    ? {
                                        ...row,
                                        reasonCode: e.target.checked
                                          ? "DAMAGE"
                                          : "UNKNOWN",
                                      }
                                    : row,
                                ),
                              )
                            }
                          />
                          هذا النقص ناتج عن تلف مؤكد
                        </label>
                      )}
                      <input
                        aria-label="ملاحظة الجرد الاختيارية"
                        placeholder="ملاحظة (اختياري)"
                        value={item.reason}
                        disabled={isCompleted || loading}
                        maxLength={2000}
                        className="w-full mt-2 border border-border rounded-lg p-2 text-sm bg-card"
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((row) =>
                              row.batchId === item.batchId
                                ? { ...row, reason: e.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                      {diff < 0 && item.reasonCode === "DAMAGE" && (
                        <p className="text-xs text-muted-foreground mt-2">
                          تُسجّل قيمة العجز كمصروف تلف مؤكد عند الاعتماد.
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredItems.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="p-8 text-center text-muted-foreground"
                  >
                    لا توجد نتائج بحث
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!isCompleted && (
        <div className="flex gap-4 justify-end border-t pt-4">
          <button
            onClick={saveDraft}
            disabled={loading}
            className="px-6 py-2 border border-border rounded-lg text-muted-foreground font-bold hover:bg-muted transition-colors"
          >
            حفظ كمسودة
          </button>

          <button
            onClick={completeStocktake}
            disabled={loading}
            className="px-6 py-2 bg-primary rounded-lg text-primary-foreground font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/30 flex items-center gap-2"
          >
            <span>✔️</span> إنهاء العد وإرسال النتيجة
          </button>
        </div>
      )}
    </div>
  );
}
