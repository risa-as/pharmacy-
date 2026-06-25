"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@faramace/ui";
import { updateExpense } from "@/app/lib/actions/expense-actions";

const CATEGORIES = [
  "إيجار",
  "رواتب",
  "كهرباء/ماء",
  "صيانة",
  "نثرية",
  "تسويق",
  "أخرى",
];

interface EditExpenseButtonProps {
  expense: {
    id: string;
    amount: number;
    category: string;
    description: string | null;
    date: string | Date;
  };
  className?: string;
}

export function EditExpenseButton({ expense, className }: EditExpenseButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);

  const initialDate = new Date(expense.date).toISOString().split("T")[0];
  const [amount, setAmount] = useState(String(expense.amount));
  const [category, setCategory] = useState(expense.category);
  const [date, setDate] = useState(initialDate);
  const [description, setDescription] = useState(expense.description ?? "");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset fields to the latest values whenever the modal is (re)opened.
  const open = () => {
    setAmount(String(expense.amount));
    setCategory(expense.category);
    setDate(new Date(expense.date).toISOString().split("T")[0]);
    setDescription(expense.description ?? "");
    setIsOpen(true);
  };

  // Categories list — include the current one if it's a custom value.
  const categoryOptions = CATEGORIES.includes(category)
    ? CATEGORIES
    : [category, ...CATEGORIES];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0 || !category) {
      toast.error("يرجى تعبئة المبلغ والفئة بشكل صحيح");
      return;
    }
    setLoading(true);
    try {
      const res = await updateExpense(expense.id, {
        amount: amt,
        category,
        description,
        date: date ? new Date(date) : undefined,
      });
      if (res.success) {
        toast.success("تم تعديل المصروف بنجاح");
        setIsOpen(false);
        router.refresh();
      } else {
        toast.error((res as any).error || "فشل في التعديل");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={cn(
          "rounded-md border p-2 hover:bg-primary/10 transition-colors hover:text-primary",
          className,
        )}
        title="تعديل"
      >
        <Pencil className="w-4 h-4" />
      </button>

      {isOpen &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => !loading && setIsOpen(false)}
          >
            <div
              className="bg-card rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200 border border-border"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-primary" />
                  تعديل المصروف
                </h3>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-muted rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-foreground">
                    المبلغ (د.ع)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-foreground">
                    الفئة
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                  >
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-foreground">
                    التاريخ
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-foreground">
                    ملاحظات / وصف
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="تفاصيل إضافية..."
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-lg font-bold disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        جاري الحفظ...
                      </>
                    ) : (
                      "حفظ التعديلات"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg font-bold disabled:opacity-50"
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
