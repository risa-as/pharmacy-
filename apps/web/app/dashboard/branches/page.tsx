export const dynamic = "force-dynamic";

import { Plus, Building2, Users, Package, Receipt } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { UpdateBranch, DeleteBranch } from "@/app/ui/branches/buttons";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requireFeature } from "@/app/lib/page-guards";
import UpgradeRequired from "@/app/ui/plan-enforcement/UpgradeRequired";

export default async function Page() {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantWhere, organizationId } = tenantCtx;

  if (organizationId) {
    const upgrade = await requireFeature(organizationId, "branchManagement");
    if (upgrade) return <UpgradeRequired {...upgrade} />;
  }

  const branches = await prisma.branch.findMany({
    where: tenantWhere,
    orderBy: { createdAt: "desc" },
    include: {
      organization: { select: { name: true } },
      _count: { select: { users: true, inventories: true, sales: true } },
    },
  });

  return (
    <div className="space-y-6" dir="rtl" suppressHydrationWarning>
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            إدارة الفروع
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {branches.length} فرع مسجّل في مؤسستك
          </p>
        </div>
        <Link
          href="/dashboard/branches/create"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          إضافة فرع
        </Link>
      </div>

      {/* الجدول */}
      <div className="glass-card overflow-hidden">
        {branches.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">لا توجد فروع حتى الآن</p>
            <p className="text-sm text-muted-foreground mt-1">
              أضف فرعك الأول للبدء
            </p>
            <Link
              href="/dashboard/branches/create"
              className="inline-flex items-center gap-2 mt-4 rounded-lg bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 transition-colors"
            >
              <Plus className="h-4 w-4" />
              إضافة فرع
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-foreground">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الفرع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المنظمة
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المستخدمون
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الأدوية
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المبيعات
                  </th>
                  <th className="px-6 py-3.5 text-center font-medium font-cairo">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {branches.map((branch: any) => (
                  <tr
                    key={branch.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">
                            {branch.name}
                          </p>
                          <p
                            className="text-xs text-muted-foreground"
                            dir="ltr"
                          >
                            {new Date(branch.createdAt).toLocaleDateString(
                              "ar-IQ",
                              { timeZone: "Asia/Baghdad" },
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                      {branch.organization.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground bg-muted rounded-md px-2.5 py-1">
                        <Users className="w-3.5 h-3.5" />
                        {branch._count.users}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground bg-muted rounded-md px-2.5 py-1">
                        <Package className="w-3.5 h-3.5" />
                        {branch._count.inventories}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground bg-muted rounded-md px-2.5 py-1">
                        <Receipt className="w-3.5 h-3.5" />
                        {branch._count.sales}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <UpdateBranch id={branch.id} />
                        <DeleteBranch id={branch.id} />
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
