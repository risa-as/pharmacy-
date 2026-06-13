export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import { Undo2, Banknote, Package, Receipt, User } from "lucide-react";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;

  const returns = await prisma.saleReturn.findMany({
    where: branchId ? { ...tenantBranchWhere, branchId } : tenantBranchWhere,
    orderBy: { createdAt: "desc" },
    include: {
      sale: { include: { user: true, patient: true } },
      branch: true,
      items: { include: { drug: true } },
    },
    take: 100,
  });

  const totalReturned = returns.reduce((acc: any, r: any) => acc + r.total, 0);
  const totalReturnedItems = returns.reduce(
    (acc: any, r: any) =>
      acc + r.items.reduce((s: any, i: any) => s + i.quantity, 0),
    0,
  );
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  const statCards = [
    {
      label: "عدد المرتجعات",
      value: String(returns.length),
      sub: "عملية إرجاع",
      icon: Undo2,
      tone: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      label: "إجمالي المبالغ المستردة (د.ع)",
      value: fmt(totalReturned),
      sub: "قيمة المرتجعات",
      icon: Banknote,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "الأصناف المرجعة",
      value: fmt(totalReturnedItems),
      sub: "وحدة",
      icon: Package,
      tone: "text-info",
      bg: "bg-info/10",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <Undo2 className="w-6 h-6 text-destructive" />
            المرتجعات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            سجل عمليات إرجاع الفواتير والمبالغ المستردة
          </p>
        </div>
        <BranchFilter currentBranch={branchId} baseUrl="/dashboard/returns" />
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* الجدول */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <Receipt className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold text-foreground">سجل عمليات الإرجاع</h2>
          {returns.length > 0 && (
            <span className="mr-auto text-xs text-muted-foreground">
              آخر {returns.length}
            </span>
          )}
        </div>

        {returns.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Undo2 className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">لا توجد مرتجعات مسجلة</p>
            <p className="text-sm text-muted-foreground mt-1">
              ستظهر هنا عمليات إرجاع الفواتير
            </p>
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
                    الفاتورة الأصلية
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الفرع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الكاشير
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الأصناف المرجعة
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المبلغ المسترد
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    ملاحظات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {returns.map((ret: any) => (
                  <tr
                    key={ret.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td
                      className="px-6 py-4 whitespace-nowrap text-right"
                      dir="ltr"
                    >
                      <div className="text-foreground">
                        {new Date(ret.createdAt).toLocaleDateString("ar-IQ", {
                          timeZone: "Asia/Baghdad",
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(ret.createdAt).toLocaleTimeString("ar-IQ", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Baghdad",
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className="font-mono text-muted-foreground text-xs bg-muted px-2 py-1 rounded"
                        dir="ltr"
                      >
                        {ret.saleId.substring(0, 8)}…
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {ret.branch?.name || "غير محدد"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        {ret.sale?.user?.name || "غير محدد"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 max-w-[220px]">
                        {ret.items.map((item: any, i: any) => (
                          <span
                            key={i}
                            className="text-xs bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-md w-fit"
                          >
                            {item.quantity} ×{" "}
                            {item.drug?.tradeName || "غير معروف"}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td
                      className="px-6 py-4 font-bold text-destructive whitespace-nowrap text-right"
                      dir="ltr"
                    >
                      {fmt(ret.total)} د.ع
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs max-w-[180px] truncate text-right">
                      {ret.notes || "—"}
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
