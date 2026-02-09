import { PrismaClient } from "@prisma/client";
import { Shield, Plus, Calendar, User } from "lucide-react";
import Link from "next/link";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function InsurancePoliciesPage() {
    const policies = await prisma.insurancePolicy.findMany({
        orderBy: { expiryDate: "desc" },
        include: {
            patient: true,
            company: true,
        },
    });

    const active = policies.filter(p => new Date(p.expiryDate) > new Date()).length;
    const expired = policies.filter(p => new Date(p.expiryDate) <= new Date()).length;

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                    <Shield className="w-7 h-7 text-blue-600" />
                    بوليصات التأمين
                </h1>
                <Link
                    href="/dashboard/insurance/policies/create"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                >
                    <Plus className="h-5 w-5" />
                    إضافة بوليصة
                </Link>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-3xl font-bold text-gray-800">{policies.length}</div>
                    <div className="text-sm text-gray-500">إجمالي البوليصات</div>
                </div>
                <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-green-600">{active}</div>
                    <div className="text-sm text-green-600">سارية</div>
                </div>
                <div className="bg-red-50 rounded-xl border border-red-200 p-4">
                    <div className="text-3xl font-bold text-red-600">{expired}</div>
                    <div className="text-sm text-red-600">منتهية</div>
                </div>
            </div>

            {/* الجدول */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {policies.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <Shield className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد بوليصات مسجلة</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
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
                            {policies.map((policy) => {
                                const isExpired = new Date(policy.expiryDate) <= new Date();
                                return (
                                    <tr key={policy.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-gray-400" />
                                                <span className="font-bold text-gray-800">{policy.patient.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {policy.company.name}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-sm text-gray-600">
                                            {policy.policyNumber}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-green-600">
                                            {policy.coverageRate}%
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-sm" suppressHydrationWarning>
                                            {new Date(policy.expiryDate).toLocaleDateString("ar-IQ")}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${isExpired
                                                    ? "bg-red-100 text-red-700"
                                                    : "bg-green-100 text-green-700"
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
