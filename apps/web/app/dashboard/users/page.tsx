export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import { UpdateUser, DeleteUser } from "@/app/ui/users/buttons";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { USER_SAFE_SELECT } from "@/app/lib/user-scope";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { Users, Shield, Pill, User } from "lucide-react";
import TableSearch from "@/app/ui/table-search";
import TablePagination from "@/app/ui/table-pagination";
import {
  TableCard, TableToolbar, ResultCount, DataTable, THead, Th, TBody, rowClass, cellClass,
  PrimaryCell, MutedText, StatusPill, Actions, EmptyState, type PillTone,
} from "@/app/ui/data-table";

const ROLE_META: Record<string, { label: string; tone: PillTone }> = {
  SUPER_ADMIN: { label: "مدير المنصة", tone: "info" },
  ADMIN: { label: "مدير", tone: "primary" },
  MANAGER: { label: "مدير فرع", tone: "primary" },
  PHARMACIST: { label: "صيدلي", tone: "success" },
  CASHIER: { label: "كاشير", tone: "warning" },
};

export default async function Page(
  props: {
    searchParams: Promise<{ branch?: string; search?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;

  const selectedBranchId = searchParams.branch || "";
  const search = (searchParams.search || "").trim().toLowerCase();

  const users = await prisma.user
    .findMany({
      where: { AND: [tenantBranchWhere, ...(selectedBranchId ? [{ branchId: selectedBranchId }] : [])] },
      orderBy: { createdAt: "desc" },
      select: USER_SAFE_SELECT,
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

  // Pagination over the filtered list, like the other tables.
  const PAGE_SIZE = 50;
  const page = Math.max(1, parseInt(searchParams.page ?? "1") || 1);
  const totalPages = Math.ceil(list.length / PAGE_SIZE);
  const pageRows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (selectedBranchId) params.set("branch", selectedBranchId);
    if (search) params.set("search", search);
    params.set("page", String(p));
    return `/dashboard/users?${params.toString()}`;
  };

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

      <BranchFilter
        currentBranch={selectedBranchId || undefined}
        baseUrl="/dashboard/users"
        extraParams={branchExtra}
      />

      {/* الجدول — بنفس تصميم جدول الدفعات وسلوكه */}
      <TableCard>
        <TableToolbar>
          <TableSearch currentQuery={search} param="search" placeholder="بحث بالاسم أو البريد..." />
          <ResultCount total={list.length} query={search} unit="مستخدم" />
        </TableToolbar>

        {list.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={search ? "لا توجد نتائج للبحث" : "لا يوجد مستخدمين حتى الآن"}
            hint={search ? "جرّب اسماً أو بريداً آخر" : undefined}
          />
        ) : (
          <DataTable>
            <THead>
              <Th>المستخدم</Th>
              <Th>الدور</Th>
              <Th>الفرع</Th>
              <Th>الحالة</Th>
              <Th center>الإجراءات</Th>
            </THead>
            <TBody>
              {pageRows.map((user: any) => {
                const role = ROLE_META[user.role] ?? { label: user.role, tone: "muted" as const };
                return (
                  <tr key={user.id} className={rowClass}>
                    <td className={cellClass}>
                      <PrimaryCell title={user.name || "بدون اسم"} subtitle={user.email} subtitleLtr maxWidth="max-w-[260px]" />
                    </td>
                    <td className={cellClass}>
                      <StatusPill tone={role.tone}>{role.label}</StatusPill>
                    </td>
                    <td className={`${cellClass} text-muted-foreground`}>
                      <MutedText>{user.branch?.name}</MutedText>
                    </td>
                    <td className={cellClass}>
                      {user.isActive === false ? (
                        <StatusPill tone="destructive">معطّل</StatusPill>
                      ) : (
                        <StatusPill tone="success">نشط</StatusPill>
                      )}
                    </td>
                    <td className={cellClass}>
                      <Actions>
                        <UpdateUser id={user.id} />
                        <DeleteUser id={user.id} />
                      </Actions>
                    </td>
                  </tr>
                );
              })}
            </TBody>
          </DataTable>
        )}

        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalCount={list.length}
          unit="مستخدم"
          hrefFor={buildPageUrl}
        />
      </TableCard>
    </div>
  );
}
