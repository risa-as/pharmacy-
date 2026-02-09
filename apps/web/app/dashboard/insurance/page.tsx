import { PrismaClient } from "@prisma/client";
import { Building2, Plus } from "lucide-react";
import Link from "next/link";
import { UpdateInsurance, DeleteInsurance } from "@/app/ui/insurance/buttons";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function InsurancePage() {
    const companies = await prisma.insuranceCompany.findMany({
        orderBy: { name: "asc" },
        include: {
            _count: { select: { policies: true } },
        },
    });

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                    <Building2 className="w-7 h-7 text-blue-600" />
                    التأمين الصحي
                </h1>
                <Link
                    href="/dashboard/insurance/create"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                >
                    <Plus className="h-5 w-5" />
                    إضافة شركة تأمين
                </Link>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-3xl font-bold text-gray-800">{companies.length}</div>
                    <div className="text-sm text-gray-500">شركات التأمين</div>
                </div>
                <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-green-600">
                        {companies.filter(c => c.isActive).length}
                    </div>
                    <div className="text-sm text-green-600">نشطة</div>
                </div>
                <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <div className="text-3xl font-bold text-blue-600">
                        {companies.reduce((acc, c) => acc + c._count.policies, 0)}
                    </div>
                    <div className="text-sm text-blue-600">بوليصات مسجلة</div>
                </div>
            </div>

            {/* جدول الشركات */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {companies.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد شركات تأمين مسجلة</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">اسم الشركة</th>
                                <th className="px-4 py-3 text-right font-bold">نسبة الخصم</th>
                                <th className="px-4 py-3 text-right font-bold">الهاتف</th>
                                <th className="px-4 py-3 text-right font-bold">عدد البوليصات</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                                <th className="px-4 py-3 text-right font-bold">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {companies.map((company) => (
                                <tr key={company.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-bold text-gray-800">
                                        {company.name}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-green-600">
                                        {company.discountRate}%
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 font-mono text-sm" dir="ltr">
                                        {company.contactPhone || "-"}
                                    </td>
                                    <td className="px-4 py-3 font-bold">
                                        {company._count.policies}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${company.isActive
                                            ? "bg-green-100 text-green-700"
                                            : "bg-gray-100 text-gray-600"
                                            }`}>
                                            {company.isActive ? "نشطة" : "متوقفة"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <UpdateInsurance id={company.id} />
                                            <DeleteInsurance id={company.id} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
