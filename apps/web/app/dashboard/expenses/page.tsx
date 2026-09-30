export const dynamic = "force-dynamic";

import { getExpenses, deleteExpense } from "@/app/lib/actions/expense-actions";
import { expenseCategoryLabel } from "@/app/lib/expense-categories";
import { DeleteButton } from "@/app/ui/delete-button";
import { EditExpenseButton } from "@/app/ui/expenses/edit-expense-button";
import {
  Plus,
  Banknote,
  CalendarDays,
  Clock,
  Receipt,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import TableSearch from "@/app/ui/table-search";
import TablePagination from "@/app/ui/table-pagination";
import { formatCurrency } from "@/app/lib/utils/currency";
import {
  TableCard, TableToolbar, ResultCount, DataTable, THead, Th, TBody, rowClass, cellClass,
  MutedText, StatusPill, Actions, actionClass, EmptyState, DateTimeCell,
} from "@/app/ui/data-table";

export default async function ExpensesPage(
  props: {
    searchParams?: Promise<{ branch?: string; category?: string; search?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
      !e.category.toLowerCase().includes(search) &&
      // Searching "إيجار" must also find rows stored as "RENT"
      !expenseCategoryLabel(e.category).toLowerCase().includes(search)
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

  // Pagination over the filtered list, like the other tables.
  const PAGE_SIZE = 50;
  const page = Math.max(1, parseInt(searchParams?.page ?? "1") || 1);
  const totalPages = Math.ceil(list.length / PAGE_SIZE);
  const pageRows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (branchId) params.set("branch", branchId);
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    params.set("page", String(p));
    return `/dashboard/expenses?${params.toString()}`;
  };

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

      <BranchFilter
        currentBranch={branchId}
        baseUrl="/dashboard/expenses"
        extraParams={branchExtra}
      />

      {/* الجدول — بنفس تصميم جدول الدفعات وسلوكه */}
      <TableCard>
        <TableToolbar>
          <TableSearch currentQuery={search} param="search" placeholder="بحث في الوصف أو الفئة..." />
          {/* تبويبات الفئات */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 overflow-x-auto max-w-full">
              <Link
                href={buildCatUrl("")}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${!category ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-background"}`}
              >
                الكل
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat}
                  href={buildCatUrl(cat)}
                  className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${category === cat ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-background"}`}
                >
                  {expenseCategoryLabel(cat)}
                </Link>
              ))}
            </div>
          )}
          <ResultCount total={list.length} query={search} unit="مصروف" />
        </TableToolbar>

        {list.length === 0 ? (
          <EmptyState
            icon={<Banknote />}
            title={search || category ? "لا توجد نتائج" : "لا يوجد مصروفات مسجلة"}
            hint={
              search || category ? (
                "جرّب كلمة بحث أو فئة أخرى"
              ) : (
                <Link href="/dashboard/expenses/create" className="text-primary hover:underline">
                  تسجيل أول مصروف
                </Link>
              )
            }
          />
        ) : (
          <DataTable>
            <THead>
              <Th>الفئة</Th>
              <Th>الفرع</Th>
              <Th>المبلغ</Th>
              <Th>التاريخ</Th>
              <Th>الوصف</Th>
              <Th center>الإجراءات</Th>
            </THead>
            <TBody>
              {pageRows.map((expense: any) => (
                <tr key={expense.id} className={rowClass}>
                  <td className={cellClass}>
                    <StatusPill tone="muted">
                      <Tag className="w-3 h-3" />
                      {expenseCategoryLabel(expense.category)}
                    </StatusPill>
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>
                    <MutedText>{expense.branch?.name}</MutedText>
                  </td>
                  <td className={`${cellClass} font-bold text-destructive whitespace-nowrap`} dir="ltr">
                    −{formatCurrency(expense.amount)}
                  </td>
                  <td className={cellClass}>
                    <DateTimeCell date={expense.date} showTime={false} />
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>
                    <MutedText maxWidth="max-w-[260px]">{expense.description}</MutedText>
                  </td>
                  <td className={cellClass}>
                    <Actions>
                      <EditExpenseButton
                        expense={{
                          id: expense.id,
                          amount: expense.amount,
                          category: expense.category,
                          description: expense.description,
                          date: expense.date,
                        }}
                        className={actionClass()}
                      />
                      <DeleteButton
                        action={deleteExpense.bind(null, expense.id)}
                        description="المصروف"
                        className="rounded-lg border-border p-1.5 text-muted-foreground hover:border-destructive/50"
                      />
                    </Actions>
                  </td>
                </tr>
              ))}
            </TBody>
          </DataTable>
        )}

        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalCount={list.length}
          unit="مصروف"
          hrefFor={buildPageUrl}
        />
      </TableCard>
    </div>
  );
}
