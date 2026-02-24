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
        <div className="glass-card w-full p-6" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <Building2 className="w-7 h-7 text-primary" />
                    التأمين الصحي
                </h1>
                <Link
                    href="/dashboard/insurance/create"
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary/90"
                >
                    <Plus className="h-5 w-5" />
                    إضافة شركة تأمين
                </Link>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{companies.length}</div>
                    <div className="text-sm text-muted-foreground">شركات التأمين</div>
                </div>
                <div className="bg-success/10 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-success">
                        {companies.filter(c => c.isActive).length}
                    </div>
                    <div className="text-sm text-success">نشطة</div>
                </div>
                <div className="bg-primary/10 rounded-xl border border-blue-200 p-4">
                    <div className="text-3xl font-bold text-primary">
                        {companies.reduce((acc, c) => acc + c._count.policies, 0)}
                    </div>
                    <div className="text-sm text-primary">بوليصات مسجلة</div>
                </div>
            </div>

            {/* جدول الشركات */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {companies.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد شركات تأمين مسجلة</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
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
                                <tr key={company.id} className="hover:bg-muted">
                                    <td className="px-4 py-3 font-bold text-foreground">
                                        {company.name}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-success">
                                        {company.discountRate}%
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground font-mono text-sm" dir="ltr">
                                        {company.contactPhone || "-"}
                                    </td>
                                    <td className="px-4 py-3 font-bold">
                                        {company._count.policies}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${company.isActive
                                            ? "bg-success/10 text-success"
                                            : "bg-muted text-muted-foreground"
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
