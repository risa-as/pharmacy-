export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import {
  Users,
  Plus,
  AlertCircle,
  HeartPulse,
  Search,
  User,
} from "lucide-react";
import Link from "next/link";
import { UpdatePatient, DeletePatient } from "@/app/ui/patients/buttons";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;
  const search =
    typeof searchParams.search === "string" ? searchParams.search.trim() : "";

  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;

  const where: any = {
    ...tenantBranchWhere,
    ...(branchId ? { branchId } : {}),
  };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
    ];
  }

  const patients = await prisma.patient.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      prescriptions: { take: 1, orderBy: { createdAt: "desc" } },
    },
    take: 200,
  });

  const allergyCount = patients.filter(
    (p: any) => p.allergies.length > 0,
  ).length;
  const chronicCount = patients.filter(
    (p: any) => p.chronicDiseases.length > 0,
  ).length;

  const statCards = [
    {
      label: "إجمالي المرضى",
      value: patients.length,
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

      {/* الفلاتر */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <BranchFilter
          currentBranch={branchId}
          baseUrl="/dashboard/patients"
          extraParams={branchExtraParams}
        />
        <form method="GET" className="relative w-full sm:max-w-xs">
          {branchId && <input type="hidden" name="branch" value={branchId} />}
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="بحث بالاسم أو رقم الهاتف..."
            className="w-full pr-10 pl-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </form>
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

      {/* الجدول */}
      <div className="glass-card overflow-hidden">
        {patients.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              {search ? "لا توجد نتائج مطابقة" : "لا يوجد مرضى مسجلين"}
            </p>
            {!search && (
              <Link
                href="/dashboard/patients/create"
                className="inline-flex items-center gap-2 mt-4 rounded-lg bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 transition-colors"
              >
                <Plus className="h-4 w-4" />
                إضافة أول مريض
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المريض
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الهاتف
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الجنس
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الحساسية
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الأمراض المزمنة
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    آخر زيارة
                  </th>
                  <th className="px-6 py-3.5 text-center font-medium font-cairo">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {patients.map((patient: any) => (
                  <tr
                    key={patient.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/patients/${patient.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {patient.name}
                        </span>
                      </Link>
                    </td>
                    <td
                      className="px-6 py-4 font-mono text-sm text-muted-foreground  text-right"
                      dir="ltr"
                    >
                      {patient.phone || "—"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {patient.gender === "male"
                        ? "ذكر"
                        : patient.gender === "female"
                          ? "أنثى"
                          : "—"}
                    </td>
                    <td className="px-6 py-4">
                      {patient.allergies.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-destructive/20 bg-destructive/10 text-destructive px-2.5 py-1 text-xs font-bold">
                          <AlertCircle className="w-3 h-3" />
                          {patient.allergies.length}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {patient.chronicDiseases.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-warning/20 bg-warning/10 text-warning px-2.5 py-1 text-xs font-bold">
                          <HeartPulse className="w-3 h-3" />
                          {patient.chronicDiseases.length}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm">
                          —
                        </span>
                      )}
                    </td>
                    <td
                      className="px-6 py-4 text-muted-foreground text-sm whitespace-nowrap text-right"
                      dir="ltr"
                      suppressHydrationWarning
                    >
                      {patient.prescriptions[0]
                        ? new Date(
                            patient.prescriptions[0].createdAt,
                          ).toLocaleDateString("ar-IQ", {
                            timeZone: "Asia/Baghdad",
                          })
                        : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <UpdatePatient id={patient.id} />
                        <DeletePatient id={patient.id} />
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
