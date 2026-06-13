export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import {
  FileText,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  Stethoscope,
  Pill,
  Layers,
} from "lucide-react";
import Link from "next/link";
import {
  UpdatePrescription,
  DeletePrescription,
  CancelPrescription,
  DispensePrescription,
} from "@/app/ui/prescriptions/buttons";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {
  PENDING: {
    label: "معلقة",
    cls: "bg-warning/10 text-warning border-warning/20",
    icon: Clock,
  },
  PARTIALLY_DISPENSED: {
    label: "صرف جزئي",
    cls: "bg-info/10 text-info border-info/20",
    icon: Layers,
  },
  DISPENSED: {
    label: "تم الصرف",
    cls: "bg-success/10 text-success border-success/20",
    icon: CheckCircle,
  },
  CANCELLED: {
    label: "ملغاة",
    cls: "bg-destructive/10 text-destructive border-destructive/20",
    icon: XCircle,
  },
};

export default async function PrescriptionsPage() {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;

  const prescriptions = await prisma.prescription.findMany({
    where: { patient: tenantBranchWhere },
    orderBy: { createdAt: "desc" },
    include: { patient: true, items: true },
  });

  const pending = prescriptions.filter(
    (p: any) => p.status === "PENDING",
  ).length;
  const dispensed = prescriptions.filter(
    (p: any) => p.status === "DISPENSED",
  ).length;
  const totalItems = prescriptions.reduce(
    (acc: any, p: any) => acc + p.items.length,
    0,
  );

  const statCards = [
    {
      label: "إجمالي الوصفات",
      value: prescriptions.length,
      icon: FileText,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "معلقة",
      value: pending,
      icon: Clock,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "تم صرفها",
      value: dispensed,
      icon: CheckCircle,
      tone: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "إجمالي الأصناف",
      value: totalItems,
      icon: Pill,
      tone: "text-info",
      bg: "bg-info/10",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl" suppressHydrationWarning>
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            الوصفات الطبية
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة وصرف الوصفات الطبية للمرضى
          </p>
        </div>
        <Link
          href="/dashboard/prescriptions/create"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          وصفة جديدة
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
        {prescriptions.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">لا توجد وصفات مسجلة</p>
            <Link
              href="/dashboard/prescriptions/create"
              className="inline-flex items-center gap-2 mt-4 rounded-lg bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 transition-colors"
            >
              <Plus className="h-4 w-4" />
              إضافة وصفة
            </Link>
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
                    الطبيب
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    التاريخ
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الأصناف
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
                {prescriptions.map((prescription: any) => {
                  const meta =
                    STATUS_META[prescription.status] ?? STATUS_META.PENDING;
                  const StatusIcon = meta.icon;
                  return (
                    <tr
                      key={prescription.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/dashboard/prescriptions/${prescription.id}`}
                          className="flex items-center gap-3 group"
                        >
                          <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {prescription.patient.name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {prescription.doctorName ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Stethoscope className="w-3.5 h-3.5" />
                            {prescription.doctorName}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className="px-6 py-4 text-muted-foreground text-right whitespace-nowrap"
                        dir="ltr"
                      >
                        {new Date(prescription.createdAt).toLocaleDateString(
                          "ar-IQ",
                          { timeZone: "Asia/Baghdad" },
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground bg-muted rounded-md px-2.5 py-1">
                          <Pill className="w-3.5 h-3.5" />
                          {prescription.items.length}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-bold ${meta.cls}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <UpdatePrescription id={prescription.id} />
                          {(prescription.status === "PENDING" ||
                            prescription.status === "PARTIALLY_DISPENSED") && (
                            <DispensePrescription
                              id={prescription.id}
                              itemIds={prescription.items.map((i: any) => i.id)}
                            />
                          )}
                          {prescription.status === "PENDING" && (
                            <CancelPrescription id={prescription.id} />
                          )}
                          <DeletePrescription id={prescription.id} />
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
