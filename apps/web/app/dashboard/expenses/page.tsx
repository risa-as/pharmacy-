export const dynamic = "force-dynamic";

import { getExpenses, deleteExpense } from "@/app/lib/actions/expense-actions";
import { DeleteButton } from "@/app/ui/delete-button";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Plus,
  Banknote,
  CalendarDays,
  Clock,
  Receipt,
  Search,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams?: { branch?: string; category?: string; search?: string };
}) {
  const branchId = searchParams?.branch;
  const category = searchParams?.category || "";
  const search = (searchParams?.search || "").trim().toLowerCase();

  const expenses = await getExpenses(branchId);

  // الإحصائيات (من كامل نتائج الفرع، قبل الفلترة)
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const total = expenses.reduce((s: number, e: any) => s + e.amount, 0);
  const monthTotal = expenses
    .filter((e: any) => new Date(e.date) >= monthStart)
    .reduce((s: number, e: any) => s + e.amount, 0);
  const todayTotal = expenses
    .filter((e: any) => new Date(e.date) >= todayStart)
    .reduce((s: number, e: any) => s + e.amount, 0);
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  // الفئات المتاحة
  const categories = Array.from(
    new Set(expenses.map((e: any) => e.category)),
  ).filter(Boolean) as string[];

  // الفلترة (فئة + بحث، في الذاكرة)
  const list = expenses.filter((e: any) => {
    if (category && e.category !== category) return false;
    if (
      search &&
      !(e.description || "").toLowerCase().includes(search) &&
      !e.category.toLowerCase().includes(search)
    )
      return false;
    return true;
  });

  const statCards = [
    {
      label: "إجمالي المصروفات (د.ع)",
      value: fmt(total),
      icon: Banknote,
      tone: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      label: "مصروفات الشهر (د.ع)",
      value: fmt(monthTotal),
      icon: CalendarDays,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "مصروفات اليوم (د.ع)",
      value: fmt(todayTotal),
      icon: Clock,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "عدد العمليات",
      value: String(expenses.length),
      icon: Receipt,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
  ];

  const buildCatUrl = (cat: string) => {
    const params = new URLSearchParams();
    if (branchId) params.set("branch", branchId);
    if (cat) params.set("category", cat);
    if (search) params.set("search", search);
    const qs = params.toString();
    return qs ? `/dashboard/expenses?${qs}` : "/dashboard/expenses";
  };

  const branchExtra =
    [
      category ? `category=${encodeURIComponent(category)}` : "",
      search ? `search=${encodeURIComponent(search)}` : "",
    ]
      .filter(Boolean)
      .join("&") || undefined;

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <Banknote className="w-6 h-6 text-destructive" />
            المصروفات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تسجيل ومتابعة المصروفات التشغيلية
          </p>
        </div>
        <Link
          href="/dashboard/expenses/create"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          مصروف جديد
        </Link>
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="glass-card p-5 flex items-center gap-4"
            >
              <div
                className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}
              >
                <Icon className={`w-6 h-6 ${card.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground truncate">
                  {card.label}
                </p>
                <p className={`text-2xl font-bold ${card.tone}`} dir="ltr">
                  {card.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* الفلاتر */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <BranchFilter
          currentBranch={branchId}
          baseUrl="/dashboard/expenses"
          extraParams={branchExtra}
        />
        <form method="GET" className="relative w-full sm:max-w-xs">
          {branchId && <input type="hidden" name="branch" value={branchId} />}
          {category && <input type="hidden" name="category" value={category} />}
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="بحث في الوصف أو الفئة..."
            className="w-full pr-10 pl-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </form>
      </div>

      {/* تبويبات الفئات */}
      {categories.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-1 text-sm text-muted-foreground font-medium ml-1">
            <Tag className="w-4 h-4" /> الفئة:
          </span>
          <Link
            href={buildCatUrl("")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!category ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
          >
            الكل
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat}
              href={buildCatUrl(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${category === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            >
              {cat}
            </Link>
          ))}
        </div>
      )}

      {/* الجدول */}
      <div className="glass-card overflow-hidden">
        {list.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Banknote className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              {search || category
                ? "لا توجد نتائج مطابقة"
                : "لا يوجد مصروفات مسجلة"}
            </p>
            {!search && !category && (
              <Link
                href="/dashboard/expenses/create"
                className="inline-flex items-center gap-2 mt-4 rounded-lg bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 transition-colors"
              >
                <Plus className="h-4 w-4" />
                تسجيل أول مصروف
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    التاريخ
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الفئة
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الفرع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المبلغ
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الوصف
                  </th>
                  <th className="px-6 py-3.5 text-center font-medium font-cairo">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {list.map((expense: any) => (
                  <tr
                    key={expense.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {format(new Date(expense.date), "PPP", { locale: ar })}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground">
                        <Tag className="w-3 h-3 text-muted-foreground" />
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {expense.branch?.name || "—"}
                    </td>
                    <td
                      className="px-6 py-4 font-bold text-destructive text-right whitespace-nowrap"
                      dir="ltr"
                    >
                      −{fmt(expense.amount)} د.ع
                    </td>
                    <td className="px-6 py-4 text-muted-foreground max-w-[260px] truncate">
                      {expense.description || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <DeleteButton
                          action={deleteExpense.bind(null, expense.id)}
                          description="المصروف"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
