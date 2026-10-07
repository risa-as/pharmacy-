export const dynamic = "force-dynamic";
import { prisma } from "@/app/lib/prisma";
import AuditLogClient from "@/app/ui/reports/audit-log-client";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { requireFeature } from "@/app/lib/page-guards";
import UpgradeRequired from "@/app/ui/plan-enforcement/UpgradeRequired";
import { ClipboardList, ShieldCheck } from "lucide-react";

export default async function AuditLogPage() {
  const ctx = await getTenantContext("read");
  if (ctx instanceof NextResponse) return null;
  if (!ctx.userPermissions.canViewAuditLog)
    return (
      <div className="glass-card p-6 text-destructive" dir="rtl">
        ليس لديك صلاحية لعرض سجل النشاطات.
      </div>
    );
  if (ctx.organizationId) {
    const upgrade = await requireFeature(ctx.organizationId, "advancedReports");
    if (upgrade) return <UpgradeRequired {...upgrade} />;
  }
  const [users, branches] = await Promise.all([
    prisma.user.findMany({
      where: ctx.tenantBranchWhere,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({
      where: ctx.branchModelWhere,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground">
            سجل النشاطات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تتبّع العمليات المسجّلة حسب المستخدم والفرع والفترة، وراجع تفاصيل كل
            نشاط.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          يعرض هذا السجل النشاطات التي سجّلها النظام؛ وجود سجل مالي أو فاتورة لا
          يعني بالضرورة وجود نشاط مقابل هنا.
        </p>
      </div>
      <AuditLogClient users={users} branches={branches} />
    </div>
  );
}
