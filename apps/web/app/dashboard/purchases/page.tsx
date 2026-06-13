export const dynamic = "force-dynamic";

import { getPurchases } from "@/app/lib/actions/purchase-actions";
import Link from "next/link";
import {
  Truck,
  ShoppingCart,
  Receipt,
  Clock,
  Banknote,
  Search,
  Building2,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { auth } from "@/auth";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import DeletePurchaseButton from "./[id]/components/delete-button";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: {
    label: "قيد الانتظار",
    cls: "bg-warning/10 text-warning border-warning/20",
  },
  COMPLETED: {
    label: "مكتمل",
    cls: "bg-success/10 text-success border-success/20",
  },
  RECEIVED: {
    label: "تم الاستلام",
    cls: "bg-info/10 text-info border-info/20",
  },
  CANCELLED: {
    label: "ملغى",
    cls: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const session = await auth();
  const branchId = session?.user?.branchId;
  const isAdmin = session?.user?.role === "ADMIN";

  if (!branchId && !isAdmin) {
    return (
      <div className="p-8 text-center text-destructive">
        يرجى تسجيل الدخول لعرض المشتريات.
      </div>
    );
  }

  const filterBranchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;
  const search =
    typeof searchParams.search === "string"
      ? searchParams.search.trim().toLowerCase()
      : "";
  const purchases = await getPurchases(filterBranchId);

  // الإحصائيات (من كامل نتائج الفرع، قبل البحث)
  const active = purchases.filter((p: any) => p.status !== "CANCELLED");
  const totalSpent = active.reduce((s: number, p: any) => s + p.total, 0);
  const pendingCount = purchases.filter(
    (p: any) => p.status === "PENDING",
  ).length;
  const outstanding = active.reduce(
    (s: number, p: any) => s + (p.total - (p.paidAmount || 0)),
    0,
  );
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  // فلترة البحث (في الذاكرة)
  const list = search
    ? purchases.filter(
        (p: any) =>
          (p.supplier?.name || "").toLowerCase().includes(search) ||
          p.id.toLowerCase().includes(search),
      )
    : purchases;

  const statCards = [
    {
      label: "عدد الطلبات",
      value: String(purchases.length),
      icon: ShoppingCart,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "إجمالي المشتريات (د.ع)",
      value: fmt(totalSpent),
      icon: Receipt,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "قيد الانتظار",
      value: String(pendingCount),
      icon: Clock,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "المستحق للموردين (د.ع)",
      value: fmt(outstanding),
      icon: Banknote,
      tone: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];

  const branchExtraParams = search
    ? `search=${encodeURIComponent(search)}`
    : undefined;

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            سجل المشتريات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            طلبات الشراء من الموردين وحالاتها
          </p>
        </div>
        <Link
          href="/dashboard/purchases/smart-order"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
        >
          <Truck className="w-4 h-4" />
          طلب ذكي جديد
        </Link>
      </div>

      {/* الفلاتر */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <BranchFilter
          currentBranch={filterBranchId}
          baseUrl="/dashboard/purchases"
          extraParams={branchExtraParams}
        />
        <form method="GET" className="relative w-full sm:max-w-xs">
          {filterBranchId && (
            <input type="hidden" name="branch" value={filterBranchId} />
          )}
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="بحث باسم المورد أو رقم الطلب..."
            className="w-full pr-10 pl-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </form>
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

      {/* الجدول */}
      <div className="glass-card overflow-hidden">
        {list.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Truck className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              {search ? "لا توجد نتائج مطابقة" : "لا يوجد سجل مشتريات"}
            </p>
            {!search && (
              <p className="text-sm text-muted-foreground mt-1">
                ابدأ بإنشاء طلب ذكي جديد
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المورد
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    رقم الطلب
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الفرع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    التاريخ
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المواد
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الإجمالي
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الحالة
                  </th>
                  <th className="px-6 py-3.5 text-center font-medium font-cairo">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {list.map((purchase: any) => {
                  const meta = STATUS_META[purchase.status] ?? {
                    label: purchase.status,
                    cls: "bg-muted text-muted-foreground border-border",
                  };
                  return (
                    <tr
                      key={purchase.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-semibold text-foreground">
                            {purchase.supplier?.name || "غير معروف"}
                          </span>
                        </div>
                      </td>
                      <td
                        className="px-6 py-4 font-mono text-right text-xs text-muted-foreground"
                        dir="ltr"
                      >
                        {purchase.id.slice(0, 8)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {purchase.branch?.name || "غير معروف"}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                        {format(new Date(purchase.createdAt), "PPP", {
                          locale: ar,
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center text-sm text-muted-foreground bg-muted rounded-md px-2.5 py-1">
                          {purchase._count.items}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 text-right font-bold text-foreground whitespace-nowrap"
                        dir="ltr"
                      >
                        {fmt(purchase.total)} د.ع
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/dashboard/purchases/${purchase.id}`}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors"
                          >
                            عرض
                          </Link>
                          {(purchase.status === "PENDING" ||
                            purchase.status === "CANCELLED") && (
                            <DeletePurchaseButton purchaseId={purchase.id} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
