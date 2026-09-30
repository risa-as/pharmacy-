export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import { Users, Plus, AlertCircle, HeartPulse } from "lucide-react";
import Link from "next/link";
import { UpdatePatient, DeletePatient } from "@/app/ui/patients/buttons";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import TableSearch from "@/app/ui/table-search";
import TablePagination from "@/app/ui/table-pagination";
import {
  TableCard, TableToolbar, ResultCount, DataTable, THead, Th, TBody, rowClass, cellClass,
  PrimaryCell, StatusPill, Actions, EmptyState, DateTimeCell,
} from "@/app/ui/data-table";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

const PAGE_SIZE = 50;

export default async function PatientsPage(
  props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  }
) {
  const searchParams = await props.searchParams;
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;
  const search =
    typeof searchParams.search === "string" ? searchParams.search.trim() : "";
  const page =
    typeof searchParams.page === "string" ? Math.max(1, parseInt(searchParams.page) || 1) : 1;

  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;

  // Intersect, never spread: a spread ?branch= would replace a branch-scoped
  // user's own { branchId } scope and expose another tenant's patients.
  const where: any = { AND: [tenantBranchWhere, ...(branchId ? [{ branchId }] : [])] };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
    ];
  }

  // The cards count every matching patient, not only the page on screen.
  const [patients, totalCount, allergyCount, chronicCount] = await Promise.all([
    prisma.patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        prescriptions: { take: 1, orderBy: { createdAt: "desc" } },
      },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.patient.count({ where }),
    prisma.patient.count({ where: { AND: [where, { allergies: { isEmpty: false } }] } }),
    prisma.patient.count({ where: { AND: [where, { chronicDiseases: { isEmpty: false } }] } }),
  ]);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const statCards = [
    {
      label: "إجمالي المرضى",
      value: totalCount,
      icon: Users,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "لديهم حساسية",
      value: allergyCount,
      icon: AlertCircle,
      tone: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      label: "أمراض مزمنة",
      value: chronicCount,
      icon: HeartPulse,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
  ];

  const branchExtraParams = search
    ? `search=${encodeURIComponent(search)}`
    : undefined;
  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (branchId) params.set("branch", branchId);
    if (search) params.set("search", search);
    params.set("page", String(p));
    return `/dashboard/patients?${params.toString()}`;
  };

  return (
    <div className="space-y-6" dir="rtl" suppressHydrationWarning>
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            سجل المرضى
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة بيانات المرضى وسجلاتهم الطبية
          </p>
        </div>
        <Link
          href="/dashboard/patients/create"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          إضافة مريض
        </Link>
      </div>

      <BranchFilter
        currentBranch={branchId}
        baseUrl="/dashboard/patients"
        extraParams={branchExtraParams}
      />

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
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p
                  className={`text-2xl font-bold ${card.value > 0 ? card.tone : "text-foreground"}`}
                >
                  {card.value.toLocaleString("en-US")}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* الجدول — بنفس تصميم جدول الدفعات وسلوكه */}
      <TableCard>
        <TableToolbar>
          <TableSearch currentQuery={search} param="search" placeholder="بحث بالاسم أو رقم الهاتف..." />
          <ResultCount total={totalCount} query={search} unit="مريض" />
        </TableToolbar>

        {patients.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={search ? "لا توجد نتائج للبحث" : "لا يوجد مرضى مسجلين"}
            hint={
              search ? (
                "جرّب اسماً أو رقماً آخر"
              ) : (
                <Link href="/dashboard/patients/create" className="text-primary hover:underline">
                  إضافة أول مريض
                </Link>
              )
            }
          />
        ) : (
          <DataTable>
            <THead>
              <Th>المريض</Th>
              <Th>الجنس</Th>
              <Th>الحساسية</Th>
              <Th>الأمراض المزمنة</Th>
              <Th>آخر وصفة</Th>
              <Th center>الإجراءات</Th>
            </THead>
            <TBody>
              {patients.map((patient: any) => (
                <tr key={patient.id} className={rowClass}>
                  <td className={cellClass}>
                    <Link href={`/dashboard/patients/${patient.id}`} className="block hover:[&_p:first-child]:text-primary">
                      <PrimaryCell title={patient.name} subtitle={patient.phone || "—"} subtitleLtr />
                    </Link>
                  </td>
                  <td className={`${cellClass} text-muted-foreground whitespace-nowrap`}>
                    {patient.gender === "male" ? "ذكر" : patient.gender === "female" ? "أنثى" : "—"}
                  </td>
                  <td className={cellClass}>
                    {patient.allergies.length > 0 ? (
                      <span title={patient.allergies.join("، ")}>
                        <StatusPill tone="destructive">
                          <AlertCircle className="w-3 h-3" />
                          {patient.allergies.length === 1 ? patient.allergies[0] : `${patient.allergies.length} أنواع`}
                        </StatusPill>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className={cellClass}>
                    {patient.chronicDiseases.length > 0 ? (
                      <span title={patient.chronicDiseases.join("، ")}>
                        <StatusPill tone="warning">
                          <HeartPulse className="w-3 h-3" />
                          {patient.chronicDiseases.length === 1 ? patient.chronicDiseases[0] : `${patient.chronicDiseases.length} أمراض`}
                        </StatusPill>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className={cellClass}>
                    {patient.prescriptions[0] ? (
                      <DateTimeCell date={patient.prescriptions[0].createdAt} showTime={false} />
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className={cellClass}>
                    <Actions>
                      <UpdatePatient id={patient.id} />
                      <DeletePatient id={patient.id} />
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
          totalCount={totalCount}
          unit="مريض"
          hrefFor={buildPageUrl}
        />
      </TableCard>
    </div>
  );
}
