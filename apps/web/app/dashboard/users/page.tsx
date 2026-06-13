export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import { UpdateUser, DeleteUser } from "@/app/ui/users/buttons";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { Users, Shield, Pill, Search, User } from "lucide-react";

const ROLE_META: Record<string, { label: string; cls: string }> = {
  SUPER_ADMIN: {
    label: "مدير المنصة",
    cls: "bg-info/10 text-info border-info/20",
  },
  ADMIN: { label: "مدير", cls: "bg-primary/10 text-primary border-primary/20" },
  MANAGER: {
    label: "مدير فرع",
    cls: "bg-primary/10 text-primary border-primary/20",
  },
  PHARMACIST: {
    label: "صيدلي",
    cls: "bg-success/10 text-success border-success/20",
  },
  CASHIER: {
    label: "كاشير",
    cls: "bg-warning/10 text-warning border-warning/20",
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams: { branch?: string; search?: string };
}) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;

  const selectedBranchId = searchParams.branch || "";
  const search = (searchParams.search || "").trim().toLowerCase();

  const users = await prisma.user
    .findMany({
      where: {
        ...tenantBranchWhere,
        ...(selectedBranchId ? { branchId: selectedBranchId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { branch: true },
    })
    .catch(() => [] as any[]);

  // إحصائيات (من كامل نتائج الفرع، قبل البحث)
  const isAdminRole = (r: string) =>
    r === "ADMIN" || r === "MANAGER" || r === "SUPER_ADMIN";
  const adminCount = users.filter((u: any) => isAdminRole(u.role)).length;
  const pharmacistCount = users.filter(
    (u: any) => u.role === "PHARMACIST",
  ).length;
  const cashierCount = users.filter((u: any) => u.role === "CASHIER").length;

  const statCards = [
    {
      label: "إجمالي المستخدمين",
      value: users.length,
      icon: Users,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "المدراء",
      value: adminCount,
      icon: Shield,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "الصيادلة",
      value: pharmacistCount,
      icon: Pill,
      tone: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "الكاشير",
      value: cashierCount,
      icon: User,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
  ];

  // فلترة البحث (في الذاكرة)
  const list = search
    ? users.filter(
        (u: any) =>
          (u.name || "").toLowerCase().includes(search) ||
          (u.email || "").toLowerCase().includes(search),
      )
    : users;

  const branchExtra = search
    ? `search=${encodeURIComponent(search)}`
    : undefined;

  return (
    <div className="space-y-6" dir="rtl" suppressHydrationWarning>
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
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p
                  className={`text-2xl font-bold ${card.value > 0 ? card.tone : "text-foreground"}`}
                >
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
          currentBranch={selectedBranchId || undefined}
          baseUrl="/dashboard/users"
          extraParams={branchExtra}
        />
        <form method="GET" className="relative w-full sm:max-w-xs">
          {selectedBranchId && (
            <input type="hidden" name="branch" value={selectedBranchId} />
          )}
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="بحث بالاسم أو البريد..."
            className="w-full pr-10 pl-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </form>
      </div>

      {/* الجدول */}
      <div className="glass-card overflow-hidden">
        {list.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              {search ? "لا توجد نتائج مطابقة" : "لا يوجد مستخدمين حتى الآن"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المستخدم
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    البريد الإلكتروني
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الدور
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الفرع
                  </th>
                  <th className="px-6 py-3.5 text-center font-medium font-cairo">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {list.map((user: any) => {
                  const role = ROLE_META[user.role] ?? {
                    label: user.role,
                    cls: "bg-muted text-muted-foreground border-border",
                  };
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-primary">
                              {(user.name || "U").charAt(0)}
                            </span>
                          </div>
                          <span className="font-semibold text-foreground">
                            {user.name || "بدون اسم"}
                          </span>
                        </div>
                      </td>
                      <td
                        className="px-6 py-4 text-right text-muted-foreground font-mono text-sm"
                        dir="ltr"
                      >
                        {user.email}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold ${role.cls}`}
                        >
                          {role.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {user.branch?.name || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <UpdateUser id={user.id} />
                          <DeleteUser id={user.id} />
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
