export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { Shield, Plus, Calendar, User } from "lucide-react";
import Link from "next/link";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export default async function InsurancePoliciesPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");
    const { tenantBranchWhere } = tenantCtx;

    const policies = await prisma.insurancePolicy.findMany({
        where: { patient: tenantBranchWhere },
        orderBy: { expiryDate: "desc" },
        include: {
            patient: true,
            company: true,
        },
    });

    const active = policies.filter((p: any) => new Date(p.expiryDate) > new Date()).length;
    const expired = policies.filter((p: any) => new Date(p.expiryDate) <= new Date()).length;

    return (
        <div className="glass-card w-full p-6" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <Shield className="w-7 h-7 text-primary" />
                    بوليصات التأمين
                </h1>
                <Link
                    href="/dashboard/insurance/policies/create"
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <Plus className="h-5 w-5" />
                    إضافة بوليصة
                </Link>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{policies.length}</div>
                    <div className="text-sm text-muted-foreground">إجمالي البوليصات</div>
                </div>
                <div className="bg-success/10 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-success">{active}</div>
                    <div className="text-sm text-success">سارية</div>
                </div>
                <div className="bg-destructive/10 rounded-xl border border-red-200 p-4">
                    <div className="text-3xl font-bold text-destructive">{expired}</div>
                    <div className="text-sm text-destructive">منتهية</div>
                </div>
            </div>

            {/* الجدول */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {policies.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Shield className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد بوليصات مسجلة</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">المريض</th>
                                <th className="px-4 py-3 text-right font-bold">شركة التأمين</th>
                                <th className="px-4 py-3 text-right font-bold">رقم البوليصة</th>
                                <th className="px-4 py-3 text-right font-bold">نسبة التغطية</th>
                                <th className="px-4 py-3 text-right font-bold">تاريخ الانتهاء</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {policies.map((policy: any) => {
                                const isExpired = new Date(policy.expiryDate) <= new Date();
                                return (
                                    <tr key={policy.id} className="hover:bg-muted">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-muted-foreground" />
                                                <span className="font-bold text-foreground">{policy.patient.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {policy.company.name}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                                            {policy.policyNumber}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-success">
                                            {policy.coverageRate}%
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-sm" suppressHydrationWarning>
                                            {new Date(policy.expiryDate).toLocaleDateString("ar-IQ")}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${isExpired
                                                ? "bg-destructive/10 text-destructive"
                                                : "bg-success/10 text-success"
                                                }`}>
                                                {isExpired ? "منتهية" : "سارية"}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
