import { PrismaClient } from "@prisma/client";
import { Users, Plus, Phone, Calendar, AlertCircle } from "lucide-react";
import Link from "next/link";
import { UpdatePatient, DeletePatient } from "@/app/ui/patients/buttons";
import { BranchFilter } from "@/app/ui/reports/branch-filter";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function PatientsPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;
    const branchWhere = branchId ? { branchId } : {};

    const patients = await prisma.patient.findMany({
        where: branchWhere,
        orderBy: { createdAt: "desc" },
        include: {
            prescriptions: { take: 1, orderBy: { createdAt: "desc" } },
        },
    });

    return (
        <div className="glass-card w-full p-6" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <Users className="w-7 h-7 text-primary" />
                    سجل المرضى
                </h1>
                <Link
                    href="/dashboard/patients/create"
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <Plus className="h-5 w-5" />
                    إضافة مريض
                </Link>
            </div>

            {/* Branch Filter */}
            <div className="mb-6">
                <BranchFilter currentBranch={branchId} baseUrl="/dashboard/patients" />
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{patients.length}</div>
                    <div className="text-sm text-muted-foreground">إجمالي المرضى</div>
                </div>
                <div className="bg-primary/10 rounded-xl border border-primary p-4">
                    <div className="text-3xl font-bold text-primary">
                        {patients.filter(p => p.allergies.length > 0).length}
                    </div>
                    <div className="text-sm text-primary">لديهم حساسية</div>
                </div>
                <div className="bg-warning/10 rounded-xl border border-warning/30 p-4">
                    <div className="text-3xl font-bold text-warning">
                        {patients.filter(p => p.chronicDiseases.length > 0).length}
                    </div>
                    <div className="text-sm text-warning">أمراض مزمنة</div>
                </div>
            </div>

            {/* جدول المرضى */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {patients.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا يوجد مرضى مسجلين</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">الاسم</th>
                                <th className="px-4 py-3 text-right font-bold">الهاتف</th>
                                <th className="px-4 py-3 text-right font-bold">الجنس</th>
                                <th className="px-4 py-3 text-right font-bold">الحساسية</th>
                                <th className="px-4 py-3 text-right font-bold">الأمراض المزمنة</th>
                                <th className="px-4 py-3 text-right font-bold">آخر زيارة</th>
                                <th className="px-4 py-3 text-right font-bold">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {patients.map((patient) => (
                                <tr key={patient.id} className="hover:bg-muted">
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/dashboard/patients/${patient.id}`}
                                            className="font-bold text-primary hover:underline"
                                        >
                                            {patient.name}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-sm text-muted-foreground" dir="ltr">
                                        {patient.phone}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {patient.gender === "male" ? "ذكر" : patient.gender === "female" ? "أنثى" : "-"}
                                    </td>
                                    <td className="px-4 py-3">
                                        {patient.allergies.length > 0 ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-destructive/10 text-destructive">
                                                <AlertCircle className="w-3 h-3" />
                                                {patient.allergies.length} حساسية
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {patient.chronicDiseases.length > 0 ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-warning/20 text-warning">
                                                {patient.chronicDiseases.length} مرض
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground text-sm" suppressHydrationWarning>
                                        {patient.prescriptions[0]
                                            ? new Date(patient.prescriptions[0].createdAt).toLocaleDateString("ar-IQ")
                                            : "-"
                                        }
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <UpdatePatient id={patient.id} />
                                            <DeletePatient id={patient.id} />
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
